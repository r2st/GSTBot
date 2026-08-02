#!/usr/bin/env bash
# Release GSTBot on the Hetzner box. Run as root:
#
#   /srv/gstbot/src/deploy/deploy.sh              # deploy origin/main
#   /srv/gstbot/src/deploy/deploy.sh v1.2.0       # deploy a tag or sha
#
# First-time server setup is in deploy/README.md; this script assumes it has
# already been done and does nothing that is only correct once.
#
# The frontend is built into a new directory and swapped in by renaming a
# symlink, which is a single atomic syscall. Copying over the live web root
# instead would serve a mixed bundle — a fresh index.html naming assets that
# are not on disk yet — to whoever loaded the page during the copy.
set -euo pipefail

ROOT=/srv/gstbot
SRC="$ROOT/src"
VENV="$ROOT/venv"
RELEASES="$ROOT/releases"
WEB="$ROOT/web"
REF="${1:-origin/main}"
# Releases kept for rollback. Each is a built frontend, a few MB.
KEEP=5

log() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
die() { printf '\033[31merror: %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "run as root (systemctl and /srv/gstbot are root-owned)"
[ -d "$SRC/.git" ] || die "$SRC is not a git checkout — see deploy/README.md"
[ -f /etc/gstbot/gstbot.env ] || die "/etc/gstbot/gstbot.env is missing"
command -v npm >/dev/null || die "npm is not installed; the frontend is built here"

log "Fetching $REF"
git -C "$SRC" fetch --prune --tags origin
git -C "$SRC" checkout --detach "$REF"
REVISION="$(git -C "$SRC" rev-parse --short HEAD)"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
RELEASE="$RELEASES/$STAMP-$REVISION"
echo "Deploying $REVISION as $STAMP"

log "Installing backend dependencies"
"$VENV/bin/pip" install --quiet --upgrade pip
"$VENV/bin/pip" install --quiet -r "$SRC/backend/requirements.txt"

log "Building the frontend"
# `npm ci` rather than `npm install`: the lockfile is the input, and a release
# that silently resolved a different version is not the thing that was tested.
( cd "$SRC/frontend" && npm ci --no-audit --no-fund && npm run build )
install -d -m 0755 "$RELEASE"
cp -r "$SRC/frontend/dist/." "$RELEASE/"
chown -R root:root "$RELEASE"
[ -f "$RELEASE/index.html" ] || die "build produced no index.html"

log "Applying migrations"
# Ahead of the restart, and on its own, so a migration that fails leaves the
# previous release serving rather than a half-started new one.
systemctl start gstbot-migrate.service \
    || die "migrations failed — nothing has been swapped; journalctl -u gstbot-migrate"

log "Publishing the frontend"
ln -sfn "$RELEASE" "$WEB.tmp"
mv -T "$WEB.tmp" "$WEB"

log "Restarting services"
systemctl restart gstbot-api.service gstbot-worker.service

log "Checking health"
for attempt in $(seq 1 30); do
    if curl -fsS --max-time 5 http://127.0.0.1:8000/api/v1/health/ready >/dev/null 2>&1; then
        echo "API is ready after ${attempt}s"
        break
    fi
    [ "$attempt" -lt 30 ] || die "API did not become ready; journalctl -u gstbot-api -n 100"
    sleep 1
done
curl -fsS --max-time 10 https://gstbot.aiknol.com/api/v1/health/live >/dev/null \
    || die "the site is not answering through Caddy; journalctl -u caddy -n 100"

log "Pruning old releases"
# Everything past the newest $KEEP, by the timestamp the directory name
# starts with. The live release sorts first, so it is never in this list —
# but it is checked anyway, because "never" here rests on the clock being
# monotonic and a clock is not something a delete should trust.
current="$(readlink -f "$WEB")"
find "$RELEASES" -mindepth 1 -maxdepth 1 -type d -print0 \
    | sort -zr \
    | tail -z -n "+$((KEEP + 1))" \
    | while IFS= read -r -d '' old; do
        if [ "$(readlink -f "$old")" != "$current" ]; then
            rm -rf "$old"
        fi
    done

log "Deployed $REVISION"
systemctl --no-pager --lines=0 status gstbot.target || true
