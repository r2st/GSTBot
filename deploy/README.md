# Deploying GSTBot

Target: one Hetzner VPS running Debian 12 or Ubuntu 24.04, serving
`gstbot.aiknol.com`. Postgres, Redis, the API, the Celery worker and Caddy all
live on that box and talk over the loopback.

```
                          ┌──────────────────────────────────────┐
  :443  ── Caddy ─────────┤  /api/*  → 127.0.0.1:8000 (uvicorn)  │
            (TLS)         │  /*      → /srv/gstbot/web (static)  │
                          └──────────────────────────────────────┘
                                       │
                       gstbot-api ─────┼───── gstbot-worker
                                       │
                        Postgres :5432 │ Redis :6379
```

Nothing but Caddy listens on a public interface. The API binds `127.0.0.1`
(see the comment in `systemd/gstbot-api.service` for why that is load-bearing
rather than tidy), and Postgres and Redis keep their distribution defaults,
which are loopback-only.

## Layout on the server

| Path | What it is | Owner |
|---|---|---|
| `/srv/gstbot/src` | git checkout, detached at the deployed revision | `root` |
| `/srv/gstbot/venv` | backend virtualenv | `root` |
| `/srv/gstbot/releases/<stamp>-<sha>` | one built frontend per release | `root` |
| `/srv/gstbot/web` | symlink to the live release | `root` |
| `/var/lib/gstbot/invoices` | uploaded invoices | `gstbot` |
| `/etc/gstbot/gstbot.env` | configuration and secrets, `0640 root:gstbot` | `root` |

The application user owns exactly one of these. It uploads invoices; it does
not need to be able to rewrite its own code, and under `ProtectSystem=strict`
it cannot.

## First-time setup

Run as root. Each step is safe to repeat.

**1. Packages**

```sh
apt update
apt install -y python3.12 python3.12-venv git curl \
               postgresql redis-server tesseract-ocr \
               nodejs npm caddy
```

`tesseract-ocr` is the OCR fallback for photographed invoices when no vision
model is reachable — without it those uploads fail rather than degrade.

**2. Service account and directories**

```sh
useradd --system --home-dir /var/lib/gstbot --shell /usr/sbin/nologin gstbot
install -d -m 0755 -o root -g root /srv/gstbot /srv/gstbot/releases
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

```sh
git clone https://github.com/<org>/GSTBot.git /srv/gstbot/src
python3.12 -m venv /srv/gstbot/venv
/srv/gstbot/venv/bin/pip install -r /srv/gstbot/src/backend/requirements.txt
```

**5. Configuration**

```sh
install -m 0640 -o root -g gstbot \
    /srv/gstbot/src/deploy/gstbot.env.example /etc/gstbot/gstbot.env
python3 -c "import secrets; print(secrets.token_urlsafe(64))"   # JWT_SECRET
$EDITOR /etc/gstbot/gstbot.env                                  # the three REPLACE_ME values
```

The shipped template will not boot: its `JWT_SECRET` is too short for the
production length check. That is deliberate — a template that started is a
template somebody would have left alone.

**6. Units**

```sh
install -m 0644 /srv/gstbot/src/deploy/systemd/* /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now gstbot.target
```

That installs four units:

| Unit | What it is |
|---|---|
| `gstbot.target` | the handle for the stack — start, stop and restart all of it |
| `gstbot-migrate.service` | `alembic upgrade head`, once, before anything queries the schema |
| `gstbot-api.service` | uvicorn on `127.0.0.1:8000` |
| `gstbot-worker.service` | the Celery worker that extracts invoices |

`gstbot-migrate.service` is a `oneshot` that stays active after it exits, and
both serving units `Requires=` it. That is what stops two processes running
`alembic upgrade` against one database at the same time — the same rule the
container entrypoint follows when it refuses to migrate from the worker.

**7. Caddy**

```sh
install -m 0644 /srv/gstbot/src/deploy/Caddyfile /etc/caddy/Caddyfile
$EDITOR /etc/caddy/Caddyfile          # set the ACME contact address
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy
```

`gstbot.aiknol.com` must already resolve to this box, or the certificate
order fails and Caddy retries with a backoff.

**8. First release**

```sh
/srv/gstbot/src/deploy/deploy.sh
```

## Releasing

```sh
/srv/gstbot/src/deploy/deploy.sh              # origin/main
/srv/gstbot/src/deploy/deploy.sh v1.2.0       # a tag or sha
```

The script fetches, installs dependencies, builds the frontend into a new
release directory, migrates, swaps the `web` symlink atomically, restarts the
services and then checks `/health/ready` on the loopback and `/health/live`
through Caddy. Anything that fails stops the release; the migration runs
before the swap, so a failed one leaves the previous frontend serving.

## Operating

```sh
systemctl status gstbot.target                # everything
journalctl -u gstbot-api -f                   # API logs (JSON)
journalctl -u gstbot-worker -f                # extraction logs
systemctl restart gstbot.target               # migrate, then API and worker

curl -s localhost:8000/api/v1/health | jq     # every dependency, with latency
```

`/api/v1/health` answers 200 while degraded and names what is degraded. A
missing `OPENROUTER_API_KEY` or a dead Redis is not an outage — extraction
falls back to heuristics and parsing runs inline — so page on
`/health/ready`, which is 503 only when the database is unreachable.

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
/srv/gstbot/src/deploy/deploy.sh <previous-sha>
```

Frontend-only rollback, without touching the backend, is a symlink swap:

```sh
ls -1 /srv/gstbot/releases            # the last 5 are kept
ln -sfn /srv/gstbot/releases/<stamp>-<sha> /srv/gstbot/web.tmp
mv -T /srv/gstbot/web.tmp /srv/gstbot/web
```

A migration is not rolled back by either. `alembic downgrade` is exercised in
CI in both directions, so it works — but it is a decision to take with the
data in front of you, not something a deploy script should do while an
incident is in progress.

## What is deliberately not here

**`gstbot-web.service`.** The frontend is a directory of static files. Caddy
serves it directly; a second web server behind the first would be another
process to supervise for no behaviour the edge does not already have. (The
`frontend/` Docker image, which bundles nginx, exists for `docker compose` —
where there is no Caddy in front — and is unused by this deployment.)

**`gstbot-beat.service`.** Celery beat runs a schedule, and there is no
schedule: nothing in `backend/app/tasks/` is periodic. An idle beat process
would sit there reporting healthy while doing nothing, which is a worse
signal than its absence.

It is worth saying what would need it. `backend/app/models/alert.py` defines
filing-deadline, mismatch, ITC-at-risk and supplier-risk alerts with delivery
state on the row — and nothing writes one. Whoever builds that will want a
beat unit; it belongs in the same change as the schedule it runs, not before.

**Backups.** Out of scope for this directory and genuinely not done. The
database holds tax documents with a statutory retention period, and
`/var/lib/gstbot/invoices` holds the originals. Neither is backed up by
anything here.
