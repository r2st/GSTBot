#!/usr/bin/env bash
# Release GSTBot on the Hetzner box. Run as root:
#
#   /opt/GSTBot/deploy/deploy.sh              # release the tree that is in /opt
#   /opt/GSTBot/deploy/deploy.sh v1.2.0       # deploy a tag or sha, needs a remote
#
# First-time server setup is in deploy/README.md; this script assumes it has
# already been done and does nothing that is only correct once.
#
# **The tree, not the remote, is the default source.** This box holds no
# credential for a private repository, so `git fetch` answers 401 — and an
# earlier version of this script fetched unconditionally and therefore could
# not release at all. What ships instead is whatever is in $ROOT, which the
# runbook puts there by rsync from a workstation. If a remote does turn out to
# be reachable (a deploy key was installed, or the repository went public) the
# same command fetches origin/main first, so installing the key is the only
# thing needed to get back to naming a revision rather than trusting an rsync.
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
LOCKFILE="$ROOT/backend/requirements.lock"
REF="${1:-}"

log() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[33mwarning: %s\033[0m\n' "$*" >&2; }
die() { printf '\033[31merror: %s\033[0m\n' "$*" >&2; exit 1; }

# Is $ROOT a checkout this box can run git against at all? Separate from
# "can it reach the remote", which is the question below and has a different
# answer here.
have_checkout() { command -v git >/dev/null && [ -d "$ROOT/.git" ]; }

# A fetch that cannot authenticate must fail, not ask. Without these, git
# against a private HTTPS remote prompts for a username on the terminal and a
# release run from cron or a detached session hangs there indefinitely — which
# is the failure mode this script's fallback exists to avoid in the first place.
export GIT_TERMINAL_PROMPT=0
export GIT_SSH_COMMAND="${GIT_SSH_COMMAND:-ssh -o BatchMode=yes}"

[ "$(id -u)" -eq 0 ] || die "run as root (systemctl and $ROOT are root-owned)"
[ -d "$ROOT/backend" ] || die "$ROOT does not hold the application — see deploy/README.md"
[ -f /etc/gstbot/gstbot.env ] || die "/etc/gstbot/gstbot.env is missing"
[ -f "$LOCKFILE" ] || die "$LOCKFILE is missing; the tree in $ROOT predates it"
command -v npm >/dev/null || die "npm is not installed; the frontend is built here"

log "Selecting the release source"
if [ -n "$REF" ]; then
    # An explicit ref is the one case where the remote is not optional: there
    # is nothing else that can turn "v1.2.0" into a tree. Failing here is the
    # honest answer, and it fails before anything has been changed.
    have_checkout || die "$ROOT is not a git checkout, so '$REF' cannot be resolved"
    git -C "$ROOT" fetch --prune --tags origin \
        || die "cannot fetch origin, so '$REF' cannot be resolved; see deploy/README.md"
    git -C "$ROOT" checkout --detach "$REF"
    echo "Checked out $REF"
elif have_checkout && git -C "$ROOT" fetch --prune --tags origin 2>/dev/null; then
    git -C "$ROOT" checkout --detach origin/main
    echo "Checked out origin/main"
else
    # The ordinary path on this box today. Nothing is fetched and nothing is
    # checked out; the tree is released exactly as rsync left it.
    echo "No reachable remote — releasing the tree already in $ROOT"
fi

# What is about to be released, named as precisely as this box can name it.
# The rsync in the runbook copies .git along with everything else, so HEAD is
# the workstation's HEAD even when the remote is unreachable — which is why
# this stays a real revision rather than a timestamp.
if have_checkout; then
    REVISION="$(git -C "$ROOT" rev-parse --short HEAD)"
    # Tracked modifications only. Ignored paths (.venv, node_modules, dist)
    # live in this tree by design and would mark every release dirty.
    if [ -n "$(git -C "$ROOT" status --porcelain --untracked-files=no)" ]; then
        REVISION="$REVISION-dirty"
        warn "the tree in $ROOT has uncommitted changes; releasing them"
    fi
else
    REVISION="unknown"
    warn "$ROOT is not a git checkout; the deployed revision cannot be named"
fi
echo "Deploying $REVISION"

log "Installing backend dependencies"
# The lock rather than requirements.txt. The latter is floors — `>=` — so
# installing from it resolves whatever PyPI published that morning, and a
# release differing from the one CI ran is exactly what a lock is for. It
# carries hashes, so pip refuses anything it did not resolve to.
"$VENV/bin/pip" install --quiet --upgrade pip
"$VENV/bin/pip" install --quiet --require-hashes -r "$LOCKFILE"

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

log "Taking a restore point"
# The migration below is the one step of a release that is not undone by
# deploying the previous revision: code goes back, a dropped column does not.
# So the dump happens here, immediately before it, rather than being left to
# tonight's timer — a restore point taken twelve hours before the change it
# exists to undo is not a restore point.
#
# `systemctl start`, not a call to backup.sh: the unit carries the service
# account, the sandbox and the EnvironmentFile, so this is the same dump the
# timer takes rather than a second code path that could work when that one
# does not. Type=oneshot, so this blocks until the dump has been written and
# read back, and reports its exit status.
#
# After the build on purpose. A frontend that does not compile should cost
# nothing, and the dump is only worth taking once the release is otherwise
# going to happen.
if [ -n "${GSTBOT_SKIP_BACKUP:-}" ]; then
    # The escape hatch exists for one situation: the disk is full and this
    # release is the fix. It is loud because every other use of it is a
    # migration applied with no way back.
    warn "GSTBOT_SKIP_BACKUP is set — migrating with no restore point"
else
    systemctl start gstbot-backup.service \
        || die "backup failed, so nothing is migrated; journalctl -u gstbot-backup -n 50"
fi

log "Applying migrations"
# Ahead of the restart, and on its own, so a migration that fails stops the
# release rather than leaving a half-started stack behind it. `restart` rather
# than `start`: the unit is RemainAfterExit=yes, so it is already "active" from
# the last release and `start` would be a no-op.
systemctl restart gstbot-migrate.service \
    || die "migrations failed; journalctl -u gstbot-migrate -n 100"

log "Restarting services"
systemctl restart gstbot-api.service gstbot-web.service gstbot-worker.service \
    gstbot-beat.service

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
