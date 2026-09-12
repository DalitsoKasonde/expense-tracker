# Changelog

## Unreleased
- Accounts now sit on a plan: a new account opens with a month of premium, an invited beta account with six, and either lapses to the free plan rather than locking anyone out of their own records
- Administrators can invite people by email, with the free premium period set per invitation, and revoke an invitation that has not been used
- The admin console shows what plan each account is on and can grant premium for a period, grant it permanently, or return an account to free
- The admin console is now one page per job — People, Invitations, Feedback, Backups, Administrators, Audit trail — instead of six sections stacked on a single scrolling page, with the sidebar marking the page you are on
- The admin console opens on an overview that says what is waiting: unread feedback, invitations nobody has accepted, suspended accounts, and whether a backup has ever been taken, each linking straight to the page that settles it
- Administrators can look an account up by its full email address, which is the only way to tell masked addresses apart when granting a plan
- The plan buttons say what they do to the account — "Premium, no expiry" rather than "Free forever" — and suspending an account or dropping it to free now asks first
- Visiting the site now opens a homepage explaining what Inscribed Expenses does, how you sign in, and exactly what a Google account is asked for, instead of sending everyone straight to the sign-in form
- A privacy policy is published at /privacy, linked from sign-in, registration and Settings, setting out what the service records about your money and who it reaches
- You can sign in with a six-digit code emailed to you, or with a Google account, instead of having to remember a password
- Emails arrive from Inscribed Expenses rather than Chuma, so the name on the message matches the name on the site
- A stock's page is laid out like the stocks dashboard: one row of four figures (market value, invested, return, dividends received) each with its context underneath, the two everyday actions in the page header, and the rest in a single strip, instead of a hero card of nested cards beside a column of buttons
- Replying to an email from Chuma reaches a real inbox; the sending address is a no-reply on a domain with no mailbox, so a reply used to vanish without either side knowing
- Forgetting your password is recoverable: ask for a reset link from the sign-in page, follow it, and set a new one — until now there was no way back into an account at all
- You can confirm your email address from Preferences, which is what makes a password reset reachable if you ever need one
- Chuma can email you a summary of what needs attention — every day, every Monday, or on the first of the month — and you choose which alerts are worth an email and which are not
- A daily summary is only sent when something actually needs attention; weekly and monthly ones always carry the month's figures
- Preferences lists the emails Chuma has actually sent you, so "did my summary go out?" has an answer
- The Reports page can email you the year's statement, with every month attached as a spreadsheet
- Feedback you submit reaches the operator by email instead of waiting to be noticed in the admin console
- A stock's page shows what each share is carried at and can fetch the latest LuSE close and save it as the valuation in one tap, instead of the price lookup living inside the update-value dialog
- A stock's page offers "Add to this stock", which opens the add form with that stock already selected, matching what bonds already had
- Share counts read as "150" rather than "150.0000"; fractional shares still show their decimals
- The stock page's amounts are set in tabular figures and its loading state matches the rest of the app
- The stock dashboard shows dividend income received beside the growth figure, with how many payments came from how many stocks, the share of invested money paid back, and the split between cash and reinvested dividends; dividends land in a cash account, so the growth figure alone could never see them
- Adding to an existing bond saves again; the query recording the purchase referenced a column that does not exist, so every attempt failed with a database error
- A bond's page now offers "Add to this bond", which opens the add form with that bond already selected instead of leaving the flow findable only from Add investment
- When adding an investment fails, the reason is shown as an error instead of grey helper text that was easy to read past
- The transaction fee is asked for after the account rather than before it, since the fee depends on which provider moved the money
- Recent fees for an account are offered as suggestions you can tap; they are never filled in for you, because fees are only sometimes the same and a stale one would be written into the record unnoticed
- Adding an entry shows what the amount and the fee together do to the balance, which is the figure that has to match an SMS alert
- The account you last used for each kind of entry is selected next time, instead of whichever account happens to be first
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
