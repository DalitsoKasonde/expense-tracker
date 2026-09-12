#!/usr/bin/env bash
# Prepare a fresh Ubuntu VM for the shared Inscribed application host.
# Run once as root after creating the Droplet with an SSH key attached.
set -euo pipefail

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  printf 'ERROR: run this script as root\n' >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl git ufw unattended-upgrades

if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi

systemctl enable --now docker

if ! id deploy >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash deploy
fi
usermod -aG docker deploy

install -d -o deploy -g deploy -m 0750 /opt/apps
install -d -o root -g root -m 0755 /srv/edge
install -d -o root -g root -m 0700 /srv/edge/letsencrypt
if [[ ! -e /srv/edge/letsencrypt/acme.json ]]; then
  install -o root -g root -m 0600 /dev/null /srv/edge/letsencrypt/acme.json
else
  chmod 0600 /srv/edge/letsencrypt/acme.json
fi

if ! docker network inspect traefik-public >/dev/null 2>&1; then
  docker network create traefik-public
fi

ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# A small swap file gives on-VM image builds breathing room without changing
# application memory limits. Do not replace an existing swap configuration.
if ! swapon --show=NAME --noheadings | grep -q .; then
  fallocate -l 2G /swapfile
  chmod 0600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  printf '/swapfile none swap sw 0 0\n' >> /etc/fstab
fi

printf '%s\n' \
  'Shared host bootstrap complete.' \
  'Next: copy the Traefik files to /srv/edge, set the ACME email, and start Traefik.' \
  'Then install each app checkout/environment and its forced-command deploy wrapper.'
