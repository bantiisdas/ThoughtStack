#!/bin/sh
set -e

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "Applying Prisma migrations..."
  # Use the local Prisma 6 CLI — `npx prisma` can fetch Prisma 7 and break schema.prisma
  ./node_modules/.bin/prisma migrate deploy
fi

exec "$@"
