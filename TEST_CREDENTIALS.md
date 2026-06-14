# Test Credentials

## Bootstrap Admin (First Login Only)
The first login creates the bootstrap admin automatically:

- **Email**: `admin@example.com`
- **Password**: `admin123` (from api/.env)

After bootstrap admin is created, no other users can log in until they are registered.

## Test User (Development)
A test user is seeded via migration `013_seed_test_user`:

- **Email**: `test@example.com`
- **Password**: `testpass123`
- **Role**: user

This user is available immediately after migrations run.

## Creating Additional Test Users
Use the registration flow at `/register` or call the API:

```bash
curl -X POST http://localhost:8080/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "sister@example.com",
    "password": "securepass123",
    "displayName": "Your Sister"
  }'
```

Then sign in with those credentials.

## Local Development Notes
- All credentials are plaintext in `.env` files — **change for production**.
- JWT_SECRET and NEXTAUTH_SECRET must be changed before deploying.
- The database stores password hashes (bcrypt), never plain passwords.
