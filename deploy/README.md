# Deploying GSTBot

Target: the shared Hetzner box (Ubuntu 24.04, aarch64, 4 GB) that also runs
GoSumo, Documedic, Herald and the knol stack, serving `gstbot.aiknol.com`.
Postgres, Redis, the API, the web server and the Celery worker are host
processes; the edge is a container.

```
                    ┌──────────────────────────────────────────────┐
  :443 ── knol-caddy┤ /api/*  → 172.18.0.1:3008  (uvicorn)         │
       (container)  │ /*      → 172.18.0.1:3009  (static-server)   │
                    └──────────────────────────────────────────────┘
                                     │  docker bridge knol_knol
                     gstbot-api ─────┼───── gstbot-worker
                                     │
              Postgres :5432 (shared) │ Redis :6379 db 6,7,8 (shared)
```

Two things about this box drive most of what follows.

**Caddy runs in a container.** `knol-caddy` serves every site on the host from
one file, `/opt/knol/Caddyfile`, bind-mounted read-only. It cannot read
`/opt/GSTBot/frontend/dist`, so the SPA needs a process to serve it — hence
`gstbot-web`, which a host Caddy would not need. Both upstreams bind
`172.18.0.1`, the bridge gateway: reachable from the edge container, not routed
from the internet. Binding loopback would hide them from Caddy; binding
`0.0.0.0` would publish the API unencrypted on the public address next to the
TLS one.

**Postgres and Redis are shared.** Redis has no isolation between numbered
databases, and db0 (GoSumo's BullMQ), db1 (Herald's Celery broker) and db3/4/5
(CAFlow) are taken, so GSTBot uses db6/7/8. Port 8000 is taken as well, by
`authmatic-agent` — GSTBot's API is on 3008 and the SPA on 3009, following the
300x convention the other products on the box use.

## Layout on the server

| Path | What it is | Owner |
|---|---|---|
| `/opt/GSTBot` | git checkout, detached at the deployed revision | `root` |
| `/opt/GSTBot/.venv` | backend virtualenv | `root` |
| `/opt/GSTBot/frontend/dist` | built SPA, served by `gstbot-web` | `root` |
| `/var/lib/gstbot/invoices` | uploaded invoices | `gstbot` |
| `/etc/gstbot/gstbot.env` | configuration and secrets, `0640 root:gstbot` | `root` |

The application user owns exactly one of these. It uploads invoices; it does
not need to be able to rewrite its own code, and under `ProtectSystem=strict`
it cannot.

## First-time setup

Run as root. Each step is safe to repeat.

**1. Packages**

Python, Node, Postgres, Redis and Docker are already on this box for the other
products. The one thing GSTBot adds:

```sh
apt update && apt install -y tesseract-ocr python3.12-venv
```

`tesseract-ocr` is the OCR fallback for photographed invoices when no vision
model is reachable — without it those uploads fail rather than degrade.

`python3.12` is named rather than `python3` because it is the interpreter CI
runs the suite on, and it is the only one this application is known to work on.
Debian's `python3` is whatever the release defaults to; on a box that has been
upgraded once that is no longer the same thing. `python3.12-venv` is a separate
package on Debian — `python3 -m venv` fails with a message about `ensurepip`
without it, which reads like a broken interpreter rather than a missing package.

**2. Service account and directories**

```sh
useradd --system --home-dir /var/lib/gstbot --shell /usr/sbin/nologin gstbot
install -d -m 0750 -o root -g gstbot /etc/gstbot
```

`/var/lib/gstbot` is not created here: `StateDirectory=gstbot` in the units
creates it with the right owner and mode the first time a unit starts, and a
hand-made one with the wrong owner is a confusing way to discover that.

**3. Database**

```sh
sudo -u postgres createuser gstbot --pwprompt
sudo -u postgres createdb gstbot --owner gstbot
```

**4. Code and virtualenv**

The repository is private and this box has no credential for it, so the tree is
pushed from a workstation rather than cloned. `--delete` keeps the server from
accumulating files that a later revision removed; `node_modules` and `dist` are
excluded because they are built on the server, from the lockfile, in step 8.

```sh
# from a workstation, in the repository root
rsync -az --delete --no-owner --no-group \
    --exclude .venv --exclude node_modules --exclude dist \
    --exclude __pycache__ --exclude .pytest_cache \
    -e "ssh -i path/to/hetzner_deploy_ed25519" \
    ./ root@89.167.8.178:/opt/GSTBot/

# on the server
python3.12 -m venv /opt/GSTBot/.venv
/opt/GSTBot/.venv/bin/pip install --require-hashes -r /opt/GSTBot/backend/requirements.lock
```

`requirements.lock`, not `requirements.txt`. The latter is floors (`>=`), so
installing from it resolves whatever PyPI published that morning; the lock is
the exact set, with hashes, and is the only thing a release installs. It is
compiled from the floors on a workstation — see "Dependencies" below.

`--no-owner --no-group` matters. Without them rsync running as root recreates
the *sender's* numeric ids, and a macOS workstation's `501:staff` is not a user
on this box — the tree lands owned by a uid that does not exist, which is
neither root nor `gstbot` and confusing to read later.

Because of this, `deploy.sh` cannot fetch on its own — see "Releasing".

**5. Configuration**

```sh
install -m 0640 -o root -g gstbot \
    /opt/GSTBot/deploy/gstbot.env.example /etc/gstbot/gstbot.env
python3 -c "import secrets; print(secrets.token_urlsafe(64))"   # JWT_SECRET
$EDITOR /etc/gstbot/gstbot.env                                  # the REPLACE_ME values
```

The shipped template will not boot: its `JWT_SECRET` is too short for the
production length check. That is deliberate — a template that started is a
template somebody would have left alone.

**6. Units**

```sh
install -m 0644 /opt/GSTBot/deploy/systemd/* /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now gstbot.target
```

That installs five units:

| Unit | What it is |
|---|---|
| `gstbot.target` | the handle for the stack — start, stop and restart all of it |
| `gstbot-migrate.service` | `alembic upgrade head`, once, before anything queries the schema |
| `gstbot-api.service` | uvicorn on `172.18.0.1:3008` |
| `gstbot-web.service` | the built SPA on `172.18.0.1:3009` |
| `gstbot-worker.service` | the Celery worker that extracts invoices |

`gstbot-migrate.service` is a `oneshot` that stays active after it exits, and
both serving units `Requires=` it. That is what stops two processes running
`alembic upgrade` against one database at the same time — the same rule the
container entrypoint follows when it refuses to migrate from the worker.

**7. Edge**

Append `deploy/caddy-gstbot.conf` to `/opt/knol/Caddyfile`, then:

```sh
docker exec knol-caddy caddy validate --config /etc/caddy/Caddyfile
docker exec knol-caddy caddy reload  --config /etc/caddy/Caddyfile
```

`reload`, not a container restart: the other sites on that instance are
serving, and a restart drops their connections to publish ours.
`gstbot.aiknol.com` must already resolve to this box, or the certificate order
fails and Caddy retries with a backoff.

**8. First release**

```sh
/opt/GSTBot/deploy/deploy.sh
```

## Releasing

A release is two commands: push the tree, then run the script.

```sh
# from a workstation, in the repository root — the step-4 rsync
rsync -az --delete --no-owner --no-group \
    --exclude .venv --exclude node_modules --exclude dist \
    --exclude __pycache__ --exclude .pytest_cache \
    -e "ssh -i path/to/hetzner_deploy_ed25519" \
    ./ root@89.167.8.178:/opt/GSTBot/

# on the server
/opt/GSTBot/deploy/deploy.sh
```

The script installs the locked dependencies, builds the frontend, migrates,
restarts the services and then checks readiness on the bridge and
`/health/live` through Caddy. Anything that fails stops the release.

**It does not fetch, because this box cannot.** The repository is private and
the box holds no credential, so `git fetch origin` answers 401. What ships is
therefore the tree in `/opt/GSTBot` exactly as rsync left it, and the script
says so on the way past:

```
==> Selecting the release source
No reachable remote — releasing the tree already in /opt/GSTBot
Deploying ff2412c
```

The revision is still a real one: the rsync copies `.git` along with
everything else, so `HEAD` on the box is the workstation's `HEAD`. If the tree
had uncommitted changes when it was pushed, the line reads `ff2412c-dirty` and
a warning goes with it — which is the whole reason to release from a clean
checkout of `main`.

Installing a read-only deploy key for `r2st/GSTBot` in
`/root/.ssh` is still the better end state, and nothing has to change here to
take it: the script tries the fetch first and only falls back when it fails.
With a key, `deploy.sh` releases `origin/main` on its own and

```sh
/opt/GSTBot/deploy/deploy.sh v1.2.0       # a tag or sha
```

starts working — an explicit ref is the one thing rsync cannot substitute for,
and the script refuses it with a message rather than releasing the wrong tree.
The rollback below assumes it too.

It builds in place rather than blue/green. On a 4 GB box shared with three
other products, keeping N releases of `node_modules` and a second copy of the
tree costs more than the seconds of downtime it removes.

## Dependencies

`backend/requirements.txt` holds floors (`>=`) and is what CI installs — that
is deliberate, and it is what makes a Dependabot bump self-verifying. The
server installs `backend/requirements.lock` instead: the same set resolved to
exact versions, with hashes, so a release cannot quietly differ from the one
the suite ran against.

Recompile the lock on a workstation whenever `requirements.txt` changes, and
commit both in the same change:

```sh
uv pip compile backend/requirements.txt --universal --python-version 3.12 \
    --generate-hashes -o backend/requirements.lock
```

`--python-version 3.12` is the interpreter on the server, not the one on the
workstation; `--universal` keeps the markers that let the same file resolve on
both. `backend/tests/test_requirements.py` fails if a floor is raised without
the lock being recompiled, or if the lock stops being a complete hash-checked
closure — the two ways this arrangement rots.

## Operating

```sh
systemctl status gstbot.target                # everything
journalctl -u gstbot-api -f                   # API logs (JSON)
journalctl -u gstbot-worker -f                # extraction logs
systemctl restart gstbot.target               # migrate, then API, web and worker

curl -s 172.18.0.1:3008/api/v1/health | jq    # every dependency, with latency
```

`/api/v1/health` answers 200 while degraded and names what is degraded. A
missing `OPENROUTER_API_KEY` or a dead Redis is not an outage — extraction
falls back to heuristics and parsing runs inline — so page on `/health/ready`,
which is 503 only when the database is unreachable.

Every log line and every response carries a correlation id (`X-Request-ID`).
It is what turns a user's screenshot into a journal query:

```sh
journalctl -u gstbot-api -u gstbot-worker --since today \
    | grep 9f2c1a0b4e7d5a63
```

The id survives the broker, so the upload and the parse it triggered are one
trace across both units.

### Rollback

```sh
/opt/GSTBot/deploy/deploy.sh <previous-sha>
```

A migration is not rolled back by that. `alembic downgrade` is exercised in CI
in both directions, so it works — but it is a decision to take with the data in
front of you, not something a deploy script should do while an incident is in
progress.

Until the deploy key exists, naming a sha does not work — see "Releasing" — so
a rollback is the same two commands as a release, run from a workstation that
has checked out the revision being rolled back to.
## What is deliberately not here

**`gstbot-beat.service`.** Celery beat runs a schedule, and there is no
schedule: nothing in `backend/app/tasks/` is periodic, and nothing defines a
`beat_schedule`. An idle beat process would sit there reporting healthy while
doing nothing, which is a worse signal than its absence.

It is worth saying what would need it. `backend/app/models/alert.py` defines
filing-deadline, mismatch, ITC-at-risk and supplier-risk alerts with delivery
state on the row — and nothing writes one. Whoever builds that will want a beat
unit; it belongs in the same change as the schedule it runs, not before.

**Backups.** Out of scope for this directory and genuinely not done. The
database holds tax documents with a statutory retention period, and
`/var/lib/gstbot/invoices` holds the originals. Neither is backed up by
anything here, and the shared Postgres cluster has no dump job either.

**Isolation from the other products.** Postgres, Redis and the edge are shared.
A `FLUSHALL`, a runaway connection count, or a bad `/opt/knol/Caddyfile` edit
takes out more than GSTBot. That is a trade the box was already making before
this app arrived; it is worth knowing rather than discovering.
