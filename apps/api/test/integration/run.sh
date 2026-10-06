#!/bin/zsh
# Creates a throwaway Postgres database, pushes the current Prisma schema into
# it, and runs the integration tests against it. Supabase is never contacted.
set -e
REPO="$(cd "$(dirname "$0")/../../../.." && pwd)"
CONTAINER=stdyapp-localdev
DB=stdyapp_test
URL="postgresql://postgres:localdev@localhost:5434/$DB"

if ! docker ps --format '{{.Names}}' | grep -q "^$CONTAINER\$"; then
  docker start "$CONTAINER" >/dev/null 2>&1 || \
  docker run -d --name "$CONTAINER" -e POSTGRES_PASSWORD=localdev \
    -e POSTGRES_DB=stdyapp -p 5434:5432 postgres:16 >/dev/null
fi
until docker exec "$CONTAINER" pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done

# Dropped and recreated each run, so a failed run cannot leave rows behind that
# change the next one's results.
docker exec "$CONTAINER" psql -U postgres -c "DROP DATABASE IF EXISTS $DB WITH (FORCE)" >/dev/null
docker exec "$CONTAINER" psql -U postgres -c "CREATE DATABASE $DB" >/dev/null

cd "$REPO/packages/core"
DATABASE_URL="$URL" DIRECT_URL="$URL" npx prisma db push --skip-generate --accept-data-loss >/dev/null
echo "test database ready"

# endSession invalidates the Redis cache, so the tests need the same broker
# settings the app uses. Without these ioredis retries against the default port
# forever and the run hangs with no output.
set -a
source <(grep -E '^(REDIS_URL|RABBITMQ_URL|RABBITMQ_USER|RABBITMQ_PASSWORD)=' "$REPO/.env" || true)
set +a

cd "$REPO/apps/api"
# A timeout so a hang fails loudly instead of blocking a run forever.
TEST_DATABASE_URL="$URL" node --test --test-timeout=60000 "test/integration/**/*.test.js"
