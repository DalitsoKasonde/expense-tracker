# Single-VM deployment (Expenses + other apps)

One Ubuntu server hosts the web app and API as Docker containers. Expenses
connects to an existing PostgreSQL container rather than creating its own.
One shared Traefik container handles TLS/routing for all apps via Docker
labels — each app is otherwise independently deployed.

Sizing: start at $12/mo (1 vCPU / 2GB RAM) with just Expenses running. 1GB/1vCPU
is too small once Docker + a Next.js container are both live. Images are built
in CI and pulled here precisely because an on-VM `docker compose build` can
transiently need 1GB+ RAM on its own and would compete with the live
containers. Watch `docker stats` / `free -m` after each new app goes on the
box and resize the Droplet (non-destructive, just a reboot) before it gets
tight rather than guessing capacity up front.

## One-time VM setup

```bash
# Docker + Compose plugin (Ubuntu droplet)
curl -fsSL https://get.docker.com | sh
apt-get install -y docker-compose-plugin

# firewall
ufw allow OpenSSH
ufw allow 80,443/tcp
ufw enable

# shared network + edge proxy
docker network create edge
mkdir -p /srv/edge/letsencrypt
touch /srv/edge/letsencrypt/acme.json
chmod 600 /srv/edge/letsencrypt/acme.json
cd /srv/edge
# copy deploy/docker-compose.traefik.yml and deploy/traefik.yml here;
# edit traefik.yml's acme.email to a real address first
docker compose -f docker-compose.traefik.yml up -d
```

Point each app's domain/subdomain DNS A record at the Droplet's IP before
first request — Traefik/Let's Encrypt won't issue a cert until DNS
resolves (it uses the HTTP-01 challenge on port 80).

## Connect the existing PostgreSQL container

Create the external database network once, then attach the existing
PostgreSQL container with the hostname `postgres`:

```bash
docker network create chuma-database
docker network connect --alias postgres chuma-database <existing-postgres-container>
```

If the network or connection already exists, do not recreate it. Create
the Expenses database and user in that PostgreSQL instance, then put those
credentials in `.env.prod`'s `DATABASE_URL`. PostgreSQL port 5432 does not
need to be published to the host or internet.

## Deploying Expenses

CI builds the images; the VM only pulls them. See
`.github/workflows/ci.yml` (build + push to GHCR, tagged with the commit
SHA) and `.github/workflows/deploy.yml` (SSH to the VM, pin that tag,
verify, roll back on failure).

First-time setup on the VM:

```bash
mkdir -p /opt/apps && cd /opt/apps
git clone <this-repo> expense-tracker && cd expense-tracker
cp .env.prod.example .env.prod
# Set DATABASE_URL for the existing PostgreSQL database.
# Also set JWT_SECRET, NEXTAUTH_SECRET, the domain values, and admin credentials.
cp docker-compose.deploy.yml.example docker-compose.deploy.yml
# Edit the Host(...) rules, cert resolver and network names for this host.

# Restrict the CI deploy key to the deploy wrapper (as root):
install -o root -g root -m 0755 \
  deploy/vm/ssh-forced-command.sh /usr/local/bin/expense-tracker-deploy
# then in /home/deploy/.ssh/authorized_keys, prefix the CI key with:
#   command="/usr/local/bin/expense-tracker-deploy",no-agent-forwarding,\
#   no-port-forwarding,no-pty,no-user-rc,no-X11-forwarding
# Reinstall the wrapper whenever deploy/vm/ssh-forced-command.sh changes;
# it warns on every run while the installed copy is stale.

# First deploy (docker login first if the GHCR package is private):
deploy/vm/deploy.sh <commit-sha>
```

The API reaches the existing PostgreSQL container through the external
`chuma-database` Docker network and runs application migrations during
startup. In production it skips migrations flagged as development-only
seeds (see `api/internal/migrations/runner.go`), so fixture accounts with
well-known passwords never land in live data. Compose only manages the
Expenses API and web containers.

Routing is declared directly on the `api`/`web` services via
`traefik.*` labels in `docker-compose.prod.yml` — Traefik picks them up
automatically over the Docker socket (`providers.docker` in
`deploy/traefik.yml`). No shared config file to edit for this app's routes.
Both services expose `/healthz` (the API also at `/api/healthz`) returning
`{"status":"ok","version":"<deployed sha>"}`; container healthchecks, the
Traefik load balancer healthchecks and the deploy verification all use it.

### Redeploy, roll back, inspect

Redeploys happen automatically when CI passes on `main`. Manually:

| What | How |
| --- | --- |
| Deploy a specific SHA | Actions → Deploy → Run workflow, set `image_tag` |
| Roll back one deploy | Actions → Deploy → Run workflow, tick `rollback` |
| Roll back on the VM | `sudo -u deploy deploy/vm/rollback.sh` |
| Current/previous tag | `cat /opt/apps/expense-tracker/.deploy-state` |

`deploy/vm/deploy.sh` pulls both images before touching the running stack,
waits for both containers to report healthy and to serve the expected
version, and restores the previous tag itself if either check fails. It
keeps the last few SHA-tagged images so a rollback never needs the
registry.

## Adding app #2, #3, #4...


Same shape every time, in its own directory under `/srv`:

1. App needs a `Dockerfile` per service and its own
   `docker-compose.prod.yml` — copy this repo's as a template, rename
   `container_name`s and router/service names (must be unique across the
   whole VM — e.g. `app2-api`, `app2-web`) and swap the image names.
2. Set that app's own `Host(...)` rule(s) to its real domain/subdomain in
   its own compose file's labels.
3. Deploy it the same way (CI-built images pulled by tag) — Traefik picks
   up the new routes immediately, no restart of the shared Traefik
   container needed, no downtime for the other apps.

Each app stays fully isolated in its own compose project; the only shared
things are the VM's resources and the one `edge` network + Traefik
instance.

## Notes

- Deploy workflow secrets: `VM_HOST`, `VM_USER`, `VM_SSH_KEY` and
  `VM_SSH_KNOWN_HOSTS`. The last one pins the VM's host key
  (`ssh-keyscan -H <host>` output); without it the workflow falls back to
  trust-on-first-use and emits a warning on every run.
- `.env.prod` is gitignored — create it by hand on the VM (or via your
  deploy pipeline's secrets), never commit it.
- The existing PostgreSQL container and its volume are not managed by
  `docker-compose.prod.yml`. Back them up and update them separately.
- Do not expose PostgreSQL's port publicly. Use `docker exec` against the
  existing PostgreSQL container for administrative access on the VM.
- `letsencrypt/acme.json` holds live TLS private keys — back it up if you
  care about avoiding Let's Encrypt rate limits on a full VM rebuild, and
  never commit it (permissions must stay `600` or Traefik refuses to use it).
- Resource ceiling: watch `docker stats` as you add apps. A noisy one can
  starve the others sharing the Droplet — bump the Droplet size or add
  per-service `deploy.resources.limits` in each compose file if that
  becomes an issue.
