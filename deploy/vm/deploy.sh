#!/usr/bin/env bash
# Deploy a pinned image tag to the production VM.
#
# Images are built and pushed by CI (.github/workflows/ci.yml) and tagged with
# the commit SHA. Nothing is built here: this box is 1 vCPU / 2 GB and an
# on-VM build competes with the live containers for RAM.
#
#   deploy.sh <commit-sha>
#
# An optional GHCR token may be piped on stdin; it is used for `docker login`
# and discarded (logout) when the script exits. Without a token the script
# falls back to already-present local images, which is what makes an offline
# rollback work.
#
# On any health failure the previous tag is restored before exiting non-zero.
set -euo pipefail

APP_DIR=${APP_DIR:-/opt/apps/expense-tracker}
IMAGE_PREFIX=${IMAGE_PREFIX:-ghcr.io/dalitsokasonde/expense-tracker}
REGISTRY=${REGISTRY:-ghcr.io}
REGISTRY_USER=${REGISTRY_USER:-github-actions}
STATE_FILE="$APP_DIR/.deploy-state"
KEEP_TAGS=${KEEP_TAGS:-3}
HEALTH_TIMEOUT=${HEALTH_TIMEOUT:-180}

COMPOSE=(docker compose -f docker-compose.prod.yml -f docker-compose.deploy.yml)
SERVICES=(api web)
declare -A PORT=([api]=8080 [web]=3000)

log() { printf '[%s] %s\n' "$(date -Is)" "$*"; }
die() { printf '[%s] ERROR: %s\n' "$(date -Is)" "$*" >&2; exit 1; }

TAG=${1:-}
[[ -n "$TAG" ]] || die "usage: deploy.sh <commit-sha>"
[[ "$TAG" =~ ^[0-9a-f]{7,40}$ ]] || die "refusing to deploy invalid tag: $TAG"

cd "$APP_DIR"
[[ -f docker-compose.deploy.yml ]] || die "missing docker-compose.deploy.yml (host-specific override)"
[[ -f .env.prod ]] || die "missing .env.prod"

read_state() {
  local key=$1
  [[ -f "$STATE_FILE" ]] || return 0
  awk -F= -v k="$key" '$1 == k { print $2 }' "$STATE_FILE"
}

PREVIOUS_TAG="$(read_state CURRENT_TAG)"

# Registry credentials arrive on stdin, never on the command line or on disk.
TOKEN=""
if [[ ! -t 0 ]]; then
  IFS= read -r -t 10 TOKEN || true
fi

LOGGED_IN=0
if [[ -n "$TOKEN" ]]; then
  if printf '%s' "$TOKEN" | docker login "$REGISTRY" -u "$REGISTRY_USER" --password-stdin >/dev/null 2>&1; then
    LOGGED_IN=1
  else
    log "WARN: docker login to $REGISTRY failed; continuing with local images only"
  fi
  unset TOKEN
fi

cleanup() {
  if [[ "$LOGGED_IN" == 1 ]]; then
    docker logout "$REGISTRY" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

# Pull everything before touching the running app: a registry failure should
# leave the current deployment untouched.
for service in "${SERVICES[@]}"; do
  ref="$IMAGE_PREFIX-$service:$TAG"
  log "Pulling $ref"
  if ! docker pull --quiet "$ref" >/dev/null; then
    docker image inspect "$ref" >/dev/null 2>&1 \
      || die "cannot pull $ref and no local copy exists"
    log "WARN: pull failed; using the local copy of $ref"
  fi
done

write_tag() {
  # docker compose reads $APP_DIR/.env for interpolation, so manual
  # `docker compose ps/logs` on the VM see the same tag as the deploy.
  local tag=$1
  printf 'IMAGE_TAG=%s\n' "$tag" > "$APP_DIR/.env.tmp"
  mv "$APP_DIR/.env.tmp" "$APP_DIR/.env"
}

start_stack() {
  IMAGE_TAG="$1" "${COMPOSE[@]}" up -d --remove-orphans
}

wait_healthy() {
  local name=$1 deadline=$((SECONDS + HEALTH_TIMEOUT)) status
  while ((SECONDS < deadline)); do
    status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$name" 2>/dev/null || echo missing)"
    case "$status" in
      healthy) return 0 ;;
      none) die "$name has no healthcheck defined; refusing to call it ready" ;;
      *) sleep 3 ;;
    esac
  done
  log "$name never became healthy (last status: ${status:-unknown})"
  docker logs --tail 40 "$name" 2>&1 | sed "s/^/  $name| /" || true
  return 1
}

serving_version() {
  local name=$1 port=$2 body
  body="$(docker exec "$name" wget -qO- "http://127.0.0.1:$port/healthz" 2>/dev/null)" || return 1
  sed -n 's/.*"version":"\([^"]*\)".*/\1/p' <<< "$body"
}

# Resolved from compose rather than hardcoded, so container renames and
# isolated test projects both keep working.
container_id() {
  local service=$1 id
  id="$("${COMPOSE[@]}" ps -q "$service" 2>/dev/null | head -1)"
  [[ -n "$id" ]] || return 1
  printf '%s' "$id"
}

verify() {
  local expected=$1 service id got
  for service in "${SERVICES[@]}"; do
    if ! id="$(IMAGE_TAG="$expected" container_id "$service")"; then
      log "no container running for service $service"
      return 1
    fi
    wait_healthy "$id" || return 1
    got="$(serving_version "$id" "${PORT[$service]}")" || {
      log "$service did not answer /healthz"
      return 1
    }
    if [[ "$got" != "$expected" ]]; then
      log "$service is serving version '$got', expected '$expected'"
      return 1
    fi
    log "$service healthy on $got"
  done
}

log "Deploying $TAG (previous: ${PREVIOUS_TAG:-none})"
write_tag "$TAG"
start_stack "$TAG"

if ! verify "$TAG"; then
  if [[ -n "$PREVIOUS_TAG" && "$PREVIOUS_TAG" != "$TAG" ]]; then
    log "Deploy of $TAG failed; restoring $PREVIOUS_TAG"
    write_tag "$PREVIOUS_TAG"
    start_stack "$PREVIOUS_TAG"
    if verify "$PREVIOUS_TAG"; then
      die "deploy of $TAG failed; rolled back to $PREVIOUS_TAG"
    fi
    die "deploy of $TAG failed and rollback to $PREVIOUS_TAG did not come up healthy"
  fi
  die "deploy of $TAG failed and there is no previous tag to restore"
fi

{
  echo "CURRENT_TAG=$TAG"
  echo "PREVIOUS_TAG=$PREVIOUS_TAG"
  echo "DEPLOYED_AT=$(date -Is)"
} > "$STATE_FILE.tmp"
mv "$STATE_FILE.tmp" "$STATE_FILE"

# Keep the newest few tags so a rollback never needs the registry. Old tags are
# what make rollback possible, so they are pruned by count, not by `prune -f`.
prune_old_tags() {
  local repo=$1 tag kept=0
  while read -r tag; do
    case "$tag" in
      latest | '<none>' | "$TAG" | "$PREVIOUS_TAG") continue ;;
    esac
    kept=$((kept + 1))
    if ((kept >= KEEP_TAGS)); then
      log "Removing old image $repo:$tag"
      docker rmi "$repo:$tag" >/dev/null 2>&1 || true
    fi
  done < <(docker images "$repo" --format '{{.Tag}}')
}

for service in "${SERVICES[@]}"; do
  prune_old_tags "$IMAGE_PREFIX-$service"
done
docker image prune -f >/dev/null

log "Deploy of $TAG complete."
