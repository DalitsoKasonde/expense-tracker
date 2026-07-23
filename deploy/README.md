# Single-VM deployment (Chuma + other apps)

One Ubuntu server hosts the web app, API, and PostgreSQL as Docker
containers. One shared Traefik container handles TLS/routing for all apps
via Docker labels — each app is otherwise independent (own compose file,
own containers, own deploy).

Sizing: start at $12/mo (1 vCPU / 2GB RAM) with just Chuma running. 1GB/1vCPU
is too small once Docker + a Next.js container are both live, and on-VM
image builds (`docker compose build`) can transiently need 1GB+ RAM on
their own. Watch `docker stats` / `free -m` after each new app goes on the
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

## Deploying Chuma

```bash
cd /srv
git clone <this-repo> chuma && cd chuma
cp .env.prod.example .env.prod
# Set POSTGRES_PASSWORD and use the same URL-safe value in DATABASE_URL.
# Also set JWT_SECRET, NEXTAUTH_SECRET, the domain values, and admin credentials.
# edit the Host(`yourdomain.com`) rules in docker-compose.prod.yml to your real domain
docker compose -f docker-compose.prod.yml up -d --build
```

The PostgreSQL container is only attached to an internal Docker network;
port 5432 is not exposed to the internet. Its data persists in the
`postgres_data` Docker volume. The API waits for PostgreSQL to be healthy
and then runs the application's migrations during startup.

Routing is declared directly on the `api`/`web` services via
`traefik.*` labels in `docker-compose.prod.yml` — Traefik picks them up
automatically over the Docker socket (`providers.docker` in
`deploy/traefik.yml`). No shared config file to edit for this app's routes.

Redeploy on new code: `git pull && docker compose -f
docker-compose.prod.yml up -d --build`.

## Adding app #2, #3, #4...

Same shape every time, in its own directory under `/srv`:

1. App needs a `Dockerfile` per service and its own
   `docker-compose.prod.yml` — copy this repo's as a template, rename
   `container_name`s and router/service names (must be unique across the
   whole VM — e.g. `app2-api`, `app2-web`) and swap the build contexts.
2. Set that app's own `Host(...)` rule(s) to its real domain/subdomain in
   its own compose file's labels.
3. `docker compose -f docker-compose.prod.yml up -d --build` in that app's
   directory — Traefik picks up the new routes immediately, no restart of
   the shared Traefik container needed, no downtime for the other apps.

Each app stays fully isolated in its own compose project; the only shared
things are the VM's resources and the one `edge` network + Traefik
instance.

## Notes

- `.env.prod` is gitignored — create it by hand on the VM (or via your
  deploy pipeline's secrets), never commit it.
- PostgreSQL runs on the Ubuntu VM in the `chuma-postgres` container. Back
  up the `postgres_data` volume regularly; a Docker volume survives
  container replacement but not loss of the VM or its disk.
- Do not expose PostgreSQL's port publicly. Use `docker compose exec
  postgres psql -U chuma -d chuma` for administrative access on the VM.
- `letsencrypt/acme.json` holds live TLS private keys — back it up if you
  care about avoiding Let's Encrypt rate limits on a full VM rebuild, and
  never commit it (permissions must stay `600` or Traefik refuses to use it).
- Resource ceiling: watch `docker stats` as you add apps. A noisy one can
  starve the others sharing the Droplet — bump the Droplet size or add
  per-service `deploy.resources.limits` in each compose file if that
  becomes an issue.
