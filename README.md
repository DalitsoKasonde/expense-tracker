# Expense Tracker

Phase 0 foundation for a local-first expense tracker monorepo:

- `web/`: Next.js 16 + TypeScript PWA shell with invite-only NextAuth login
- `api/`: Go + `chi` + `pgx` API with JWT auth and bootstrap-admin login
- `api/migrations/`: SQL migrations for the core schema

## Local setup

1. Ensure PostgreSQL is running locally.
2. Copy `.env.example` values into your shell or local env files.
3. In `web/`, create `.env.local` with:

```bash
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=change-me
NEXT_PUBLIC_API_BASE_URL=http://localhost:8080
API_BASE_URL=http://localhost:8080
```

`NEXT_PUBLIC_API_BASE_URL` is required for browser-side requests. `API_BASE_URL` is used by server-side auth handlers.

4. In `api/`, create `.env` with:

```bash
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/expense_tracker?sslmode=disable
JWT_SECRET=change-me
APP_ORIGIN=http://localhost:3000
ADMIN_BOOTSTRAP_EMAIL=admin@example.com
ADMIN_BOOTSTRAP_PASSWORD=change-me
```

`APP_ORIGIN` accepts a comma-separated list. For local development, include every frontend origin you actually use, for example `http://localhost:3000,http://127.0.0.1:3000`. If you open the PWA from another device on your LAN, use your computer's LAN IP in both `APP_ORIGIN` and `NEXT_PUBLIC_API_BASE_URL`.

5. Run migrations:

```bash
cd api
go run ./cmd/migrate up
```

6. Start the API:

```bash
cd api
go run ./cmd/api
```

7. Start the web app:

```bash
cd web
npm install
npm run dev
```

## Bootstrap admin

Invite-only auth means users cannot self-register. The first successful login with:

- `ADMIN_BOOTSTRAP_EMAIL`
- `ADMIN_BOOTSTRAP_PASSWORD`

creates the first admin user automatically in PostgreSQL if no users exist yet.

After that, only existing users in the `users` table can sign in.
