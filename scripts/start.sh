#!/bin/sh
# Production start: apply database migrations and the idempotent seed, then start Next.js.
# Runs on every Railway start so the schema is always current, even if the
# platform's pre-deploy step is not configured. A missing or unreachable database
# does not block startup: the app serves its "temporary issue" fallbacks instead.
set -u

if [ -n "${DATABASE_URL:-}" ]; then
  echo "[start] applying database migrations"
  if npx prisma migrate deploy; then
    npx prisma db seed || echo "[start] seed failed - continuing"
  else
    echo "[start] migrations failed - continuing so the health endpoint can report it"
  fi
else
  echo "[start] DATABASE_URL is not set - skipping migrations"
fi

exec npx next start -H 0.0.0.0 -p "${PORT:-3000}"
