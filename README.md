# Expenses

A local-first financial workspace for accounts, daily money movement, goals, imports, and investments:

- `web/`: Next.js 16 + TypeScript PWA shell with NextAuth login and self-service registration
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

## Accounts and bootstrap admin

New users can create a member account at `/register`. Passwords must contain at least eight characters, including a letter and a number.

The bootstrap credentials are only used to create the first administrator. When the database contains no users, the first successful login with:

- `ADMIN_BOOTSTRAP_EMAIL`
- `ADMIN_BOOTSTRAP_PASSWORD`

creates the first admin user automatically in PostgreSQL if no users exist yet.

After the first user exists, changing these environment variables does not change that administrator's stored password. Additional users should register through `/register` and receive the `member` role.

### Registration security

Registration is intended for local or trusted-group deployments. New accounts become active immediately; email verification is not implemented. Every member request is scoped to the authenticated user's data.

## System administration

The `system_admin` role has a separate `/admin` console for operational user access, encrypted database backups, and an administrative audit trail. It cannot use member financial endpoints. The user list exposes masked email addresses and account metadata only; balances, transactions, loans, investments, and other personal financial records are not exposed.

Subscriptions are intentionally not implemented yet.

Bootstrap the first system administrator with protected environment values:

```dotenv
SYSTEM_ADMIN_BOOTSTRAP_EMAIL=ops@example.com
SYSTEM_ADMIN_BOOTSTRAP_PASSWORD=use-a-long-unique-password
```

On startup, the API creates this identity only when no `system_admin` exists. Remove both values from the environment after the first successful deployment. The initial administrator can create additional system administrators from `/admin`; those actions are audited. The packaged `adminctl` command remains available for recovery if every system administrator account becomes inaccessible.

For production backups, add a persistent 32-byte encryption key to `.env.prod`. Generate it once, store a protected copy outside the application server, and do not rotate it without retaining the old key for existing backups:

```bash
openssl rand -base64 32
```

```dotenv
BACKUP_ENCRYPTION_KEY=the-generated-base64-value
```

Production Compose mounts the encrypted backup directory at `/var/lib/expenses/backups`. The admin console can create backups and view their status, size, and SHA-256 checksum; it cannot download or inspect backup contents. A backup is only useful if its encryption key is retained separately and restore procedures are tested periodically.
