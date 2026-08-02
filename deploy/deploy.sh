#!/usr/bin/env bash
# Release GSTBot on the Hetzner box. Run as root:
#
#   /opt/GSTBot/deploy/deploy.sh              # deploy origin/main
#   /opt/GSTBot/deploy/deploy.sh v1.2.0       # deploy a tag or sha
#
# First-time server setup is in deploy/README.md; this script assumes it has
# already been done and does nothing that is only correct once.
#
# Unlike a blue/green release, this builds in place: the checkout and the build
# output are the live ones. The box is shared with three other products and has
# roughly 2 GB of headroom, so keeping N releases of node_modules on disk and a
# second copy of the tree costs more than the seconds of downtime it removes.
# While the frontend rebuilds, gstbot-web keeps serving the previous dist from
# the open file handles it already has; the swap is the restart at the end.
set -euo pipefail

ROOT=/opt/GSTBot
VENV="$ROOT/.venv"
REF="${1:-origin/main}"

log() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
die() { printf '\033[31merror: %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "run as root (systemctl and $ROOT are root-owned)"
[ -d "$ROOT/.git" ] || die "$ROOT is not a git checkout — see deploy/README.md"
[ -f /etc/gstbot/gstbot.env ] || die "/etc/gstbot/gstbot.env is missing"
command -v npm >/dev/null || die "npm is not installed; the frontend is built here"

log "Fetching $REF"
git -C "$ROOT" fetch --prune --tags origin
git -C "$ROOT" checkout --detach "$REF"
REVISION="$(git -C "$ROOT" rev-parse --short HEAD)"
echo "Deploying $REVISION"

log "Installing backend dependencies"
"$VENV/bin/pip" install --quiet --upgrade pip
"$VENV/bin/pip" install --quiet -r "$ROOT/backend/requirements.txt"

log "Building the frontend"
# `npm ci` rather than `npm install`: the lockfile is the input, and a release
# that silently resolved a different version is not the thing that was tested.
#
# NODE_OPTIONS caps the heap. Node sizes its default from total RAM, which on a
# 4 GB box shared with three other products is well above what is actually
# free — the build then gets OOM-killed at the rollup stage instead of failing
# with something that names the cause.
( cd "$ROOT/frontend" \
    && npm ci --no-audit --no-fund \
    && NODE_OPTIONS=--max-old-space-size=768 npm run build )
[ -f "$ROOT/frontend/dist/index.html" ] || die "build produced no index.html"

log "Applying migrations"
# Ahead of the restart, and on its own, so a migration that fails stops the
# release rather than leaving a half-started stack behind it. `restart` rather
# than `start`: the unit is RemainAfterExit=yes, so it is already "active" from
# the last release and `start` would be a no-op.
systemctl restart gstbot-migrate.service \
    || die "migrations failed; journalctl -u gstbot-migrate -n 100"

log "Restarting services"
systemctl restart gstbot-api.service gstbot-web.service gstbot-worker.service

log "Checking health"
for attempt in $(seq 1 30); do
    if curl -fsS --max-time 5 http://172.18.0.1:3008/api/v1/health/ready >/dev/null 2>&1; then
        echo "API is ready after ${attempt}s"
        break
    fi
    [ "$attempt" -lt 30 ] || die "API did not become ready; journalctl -u gstbot-api -n 100"
    sleep 1
done
curl -fsS --max-time 10 http://172.18.0.1:3009/ >/dev/null \
    || die "the SPA is not being served; journalctl -u gstbot-web -n 100"
curl -fsS --max-time 10 https://gstbot.aiknol.com/api/v1/health/live >/dev/null \
    || die "the site is not answering through Caddy; docker logs knol-caddy --tail 100"

log "Deployed $REVISION"
systemctl --no-pager --lines=0 status gstbot.target || true
