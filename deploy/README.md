# Single-VM deployment (Chuma + other apps)

One Ubuntu server hosts the web app and API as Docker containers. Chuma
connects to an existing PostgreSQL container rather than creating its own.
One shared Traefik container handles TLS/routing for all apps via Docker
labels — each app is otherwise independently deployed.

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

## Connect the existing PostgreSQL container

Create the external database network once, then attach the existing
PostgreSQL container with the hostname `postgres`:

```bash
docker network create chuma-database
docker network connect --alias postgres chuma-database <existing-postgres-container>
```

If the network or connection already exists, do not recreate it. Create
the Chuma database and user in that PostgreSQL instance, then put those
credentials in `.env.prod`'s `DATABASE_URL`. PostgreSQL port 5432 does not
need to be published to the host or internet.

## Deploying Chuma

```bash
cd /srv
git clone <this-repo> chuma && cd chuma
cp .env.prod.example .env.prod
# Set DATABASE_URL for the existing PostgreSQL database.
# Also set JWT_SECRET, NEXTAUTH_SECRET, the domain values, and admin credentials.
# edit the Host(`yourdomain.com`) rules in docker-compose.prod.yml to your real domain
docker compose -f docker-compose.prod.yml up -d --build
```

The API reaches the existing PostgreSQL container through the external
`chuma-database` Docker network and runs application migrations during
startup. Compose only manages the Chuma API and web containers.

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
