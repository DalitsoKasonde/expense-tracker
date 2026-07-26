# Changelog

## Unreleased
- CI builds and pushes SHA-tagged images to GHCR; the production VM only pulls them, so a 1 vCPU / 2 GB box no longer builds Next.js and Go next to the live containers
- Deploys pin an exact image tag, verify both containers are healthy and serving that commit, and restore the previous tag automatically when they are not
- Manual deploy and one-click rollback via the Deploy workflow's `workflow_dispatch` inputs; `deploy/vm/rollback.sh` does the same on the VM
- `api` and `web` both expose `/healthz` with the deployed commit; container, Traefik load balancer and pipeline checks all use it, and `web` waits for `api` to be healthy before starting
- Production skips development-only seed migrations, so fixture accounts with published passwords can no longer be created in live data
- Deploy tooling is version-controlled (`deploy/vm/`) and the CI deploy key is restricted to an SSH forced command instead of a full shell
- CI only runs images on `main`, has per-job timeouts, cancels superseded PR runs, and pins the VM host key when `VM_SSH_KNOWN_HOSTS` is set

## 0.4.0 - 2026-07-24
- Rebranded from Chuma to Expenses by Inscribed (new logo, app name, PWA manifest)
- Investment purchases are now recorded atomically, so a failed asset-lot write can no longer leave an orphaned transaction
- Active account names are now enforced unique per user; duplicates are repaired automatically
- Assets with no recorded position are excluded from portfolio totals and clearly labeled instead of showing an authoritative zero
- Reports and Notifications now log request-scoped diagnostics and show a friendly retry state instead of raw errors
- Account selectors across the app now show account type and currency for disambiguation
- Onboarding shortened to two screens; starter accounts are now optional

## 0.3.0 - 2026-07-23
- Account-to-account transfers and stock purchase totals
- Personal savings goals split into their own /goals page
- Made asset symbols optional
- App version shown in settings footer
- PWA app icons and logo
- Deploy: DigitalOcean app spec and Traefik-based production compose, connecting to an existing PostgreSQL container
- Onboarding completion is now tracked, with interest-based setup prompts on the Today page
- Stronger registration password validation and a login-to-register link
- Investments page shows an empty state before the first holding is added

## 0.2.0 - 2026-07-23
- Chuma redesign: new visual/UX overhaul across the app shell
- PWA experience: installable app with offline support via service worker

## 0.1.0 - initial build
- Backend: accounts, transactions, savings groups, imports, investments (Phases 0-5)
- Frontend: core app screens and flows (Phases 1-5)
- Onboarding flow with default accounts, auth fixes
- Fixed "Failed to fetch" error by converting `apiCall` to a `useApiCall` hook
