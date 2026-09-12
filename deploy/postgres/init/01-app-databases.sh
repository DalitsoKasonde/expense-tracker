#!/usr/bin/env bash
set -euo pipefail

psql --set ON_ERROR_STOP=1 \
  --set expenses_password="$EXPENSES_DB_PASSWORD" \
  --set pomodoro_password="$POMODORO_DB_PASSWORD" \
  --set inscribed_password="$INSCRIBED_DB_PASSWORD" \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" <<'SQL'
CREATE ROLE expenses_user LOGIN PASSWORD :'expenses_password';
CREATE ROLE pomodoro_user LOGIN PASSWORD :'pomodoro_password';
CREATE ROLE inscribed LOGIN PASSWORD :'inscribed_password';

CREATE DATABASE expense_tracker OWNER expenses_user;
CREATE DATABASE pomodoro OWNER pomodoro_user;
CREATE DATABASE inscribed OWNER inscribed;
SQL
