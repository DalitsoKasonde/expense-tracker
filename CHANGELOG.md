# Changelog

## Unreleased
- An entry now has to be in the currency of the account it moves through; one saved in any other currency was stored and listed but counted toward no balance anywhere, so the books quietly stopped reconciling
- An account's currency can no longer be changed once it has transactions, which detached its whole history from its balance in the same silent way
- The bond dashboard reports coupon income actually received as its gain, with the withholding tax that produced the net figure and a separate line for coupons still scheduled; a bond is carried at principal, so the previous "current value less cost" gain was always zero
- Coupons that came due are posted before bond income is summarised, so the figure no longer depends on which request happened to arrive first
- Add-entry type chips read design tokens, so the picker no longer shows light-mode pastel chips in dark mode or the Sonto colour scheme
- Money figures are set in a face with real tabular numerals; Quicksand's digits are proportional and it ships no `tnum`, so amounts never actually lined up in a column
- Browser and installed-PWA chrome follows the theme and colour scheme you picked instead of the operating system's
- The installed app's Portfolio shortcut pointed at `/portfolio`, which does not exist, and opened a 404
- Badge text in the Sonto light scheme meets AA contrast, and the accent blue and purple are darkened where they carry small text
- The wordmark is drawn from a colour token, so it repaints with the theme instead of sitting on a white chip in dark mode
- Installs no longer download ~2.4 MB of images the app never renders: an unused logo, the Open Graph image, and a byte-identical duplicate of the 512px icon
- Transaction filters, dialog scrims, and money amounts come from shared primitives rather than per-call-site recipes
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
