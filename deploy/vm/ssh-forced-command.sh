#!/usr/bin/env bash
# SSH forced command for the GitHub Actions deploy key.
#
# Install (as root, once — and again whenever this file changes):
#
#   install -o root -g root -m 0755 \
#     /opt/apps/expense-tracker/deploy/vm/ssh-forced-command.sh \
#     /usr/local/bin/expense-tracker-deploy
#
# and restrict the key in /home/deploy/.ssh/authorized_keys:
#
#   command="/usr/local/bin/expense-tracker-deploy",no-agent-forwarding,\
#   no-port-forwarding,no-pty,no-user-rc,no-X11-forwarding ssh-ed25519 AAAA... deploy-key
#
# The key then cannot open a shell; it can only run the actions below. This
# file deliberately lives outside the git checkout so that syncing the repo
# cannot swap out the script that is currently executing.
#
# Accepted commands (via SSH_ORIGINAL_COMMAND):
#   deploy <commit-sha>   sync the checkout to that SHA and deploy its images
#   rollback              redeploy the previously deployed tag
#   status                print deployment state and container status
set -euo pipefail

APP_DIR=${APP_DIR:-/opt/apps/expense-tracker}
STATE_FILE="$APP_DIR/.deploy-state"
SELF=/usr/local/bin/expense-tracker-deploy
REPO_COPY="$APP_DIR/deploy/vm/ssh-forced-command.sh"

log() { printf '[%s] %s\n' "$(date -Is)" "$*"; }
die() { printf '[%s] ERROR: %s\n' "$(date -Is)" "$*" >&2; exit 1; }

read -r -a argv <<< "${SSH_ORIGINAL_COMMAND:-}"
action=${argv[0]:-}
target=${argv[1]:-}

read_state() {
  local key=$1
  [[ -f "$STATE_FILE" ]] || return 0
  awk -F= -v k="$key" '$1 == k { print $2 }' "$STATE_FILE"
}

sync_checkout() {
  local sha=$1
  cd "$APP_DIR"
  git fetch --quiet origin main
  git cat-file -e "${sha}^{commit}" 2>/dev/null || die "commit $sha not found in origin"
  git reset --quiet --hard "$sha"
  log "Checkout synced to $sha"
  if [[ -f "$REPO_COPY" ]] && ! cmp -s "$SELF" "$REPO_COPY"; then
    log "WARN: $SELF differs from $REPO_COPY; reinstall it as root to pick up changes"
  fi
}

case "$action" in
  deploy)
    [[ "$target" =~ ^[0-9a-f]{7,40}$ ]] || die "invalid commit sha: ${target:-<empty>}"
    sync_checkout "$target"
    exec "$APP_DIR/deploy/vm/deploy.sh" "$target"
    ;;
  rollback)
    previous="$(read_state PREVIOUS_TAG)"
    [[ -n "$previous" ]] || die "no previous tag recorded in $STATE_FILE"
    log "Rolling back to $previous"
    sync_checkout "$previous"
    exec "$APP_DIR/deploy/vm/deploy.sh" "$previous"
    ;;
  status)
    [[ -f "$STATE_FILE" ]] && cat "$STATE_FILE"
    cd "$APP_DIR"
    exec docker compose -f docker-compose.prod.yml -f docker-compose.deploy.yml ps
    ;;
  *)
    die "refused: only 'deploy <sha>', 'rollback' and 'status' are permitted (got: ${SSH_ORIGINAL_COMMAND:-<empty>})"
    ;;
esac
