#!/bin/sh
# Container entrypoint. One image runs the API, the worker and one-shot admin
# commands; the first argument picks which.
#
#   api      uvicorn, after running migrations
#   worker   the Celery worker
#   migrate  run migrations and exit
#   shell    a Python REPL with the app importable
#
# Anything else is exec'd verbatim, so `docker compose run --rm api alembic
# history` works without a second image.
set -eu

wait_for_database() {
    # Compose's depends_on only waits for the container, not for Postgres to
    # finish its own first-boot initialisation. Without this the first API
    # container in a fresh stack races the database and dies on migration.
    attempt=0
    until python -c "
import sys
from sqlalchemy import create_engine, text
from app.core.config import settings
try:
    create_engine(settings.database_url, pool_pre_ping=True).connect().execute(text('SELECT 1'))
except Exception as exc:
    print(exc, file=sys.stderr)
    sys.exit(1)
" 2>/dev/null; do
        attempt=$((attempt + 1))
        if [ "$attempt" -ge 30 ]; then
            echo "Database did not become reachable after 30 attempts; giving up." >&2
            exit 1
        fi
        echo "Waiting for the database (attempt ${attempt}/30)…"
        sleep 2
    done
}

run_migrations() {
    echo "Running database migrations…"
    alembic upgrade head
}

case "${1:-api}" in
    api)
        wait_for_database
        run_migrations
        # No --reload: the compose file mounts the source and overrides this
        # command when a developer wants reloading, so the default stays the
        # one that is safe to ship.
        exec uvicorn app.main:app \
            --host 0.0.0.0 \
            --port 8000 \
            --proxy-headers \
            --forwarded-allow-ips='*' \
            --workers "${WEB_CONCURRENCY:-2}"
        ;;
    worker)
        wait_for_database
        # Deliberately no migrations here: two containers running `alembic
        # upgrade` against one database at the same time is how you get a
        # half-applied schema. The API owns the schema.
        exec celery -A app.celery_app worker \
            --loglevel="${CELERY_LOG_LEVEL:-info}" \
            --concurrency="${CELERY_CONCURRENCY:-2}"
        ;;
    migrate)
        wait_for_database
        run_migrations
        ;;
    shell)
        exec python
        ;;
    *)
        exec "$@"
        ;;
esac
