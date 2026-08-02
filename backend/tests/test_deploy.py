"""Checks over the deployment manifests in ``deploy/``.

None of this runs on the server, so nothing here can prove the deployment
works. What it can prove is that the four files agree with each other and with
the application — which is where this class of configuration actually goes
wrong. A port changed in the unit and not in the Caddyfile, an upload limit
raised in the env file past what the edge will accept, a module path that was
renamed in ``app/`` months after the ``ExecStart`` line was written: each of
those is silent until a deploy, and each is a string comparison here.

The other half is the production configuration itself. ``gstbot.env.example``
is fed through the real ``Settings`` model, so the template ships in a state
that boots cleanly and logs no warnings — and the assertion that it does is
the same code path the server runs.
"""
from __future__ import annotations

import os
import re
import secrets
import stat
import subprocess
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.core.config import Settings, validate_startup_config

REPO_ROOT = Path(__file__).resolve().parents[2]
DEPLOY = REPO_ROOT / "deploy"
SYSTEMD = DEPLOY / "systemd"

CADDYFILE = DEPLOY / "Caddyfile"
ENV_EXAMPLE = DEPLOY / "gstbot.env.example"
DEPLOY_SCRIPT = DEPLOY / "deploy.sh"
TARGET = SYSTEMD / "gstbot.target"

SERVICE_UNITS = ("gstbot-migrate.service", "gstbot-api.service", "gstbot-worker.service")

# The one address this deployment answers on. Written out rather than derived,
# because "the Caddyfile and the CORS list agree" is only interesting if they
# agree on the right thing.
SITE = "gstbot.aiknol.com"

# Directives that make the unit's sandbox a sandbox. Asserted as a set across
# every unit rather than one by one: they run the same code as the same user,
# so a directive present on two units and missing from the third is an
# oversight, and that is the shape this catches.
HARDENING = {
    "NoNewPrivileges": "yes",
    "PrivateTmp": "yes",
    "PrivateDevices": "yes",
    "ProtectSystem": "strict",
    "ProtectHome": "yes",
    "ProtectProc": "invisible",
    "ProtectClock": "yes",
    "ProtectHostname": "yes",
    "ProtectKernelTunables": "yes",
    "ProtectKernelModules": "yes",
    "ProtectKernelLogs": "yes",
    "ProtectControlGroups": "yes",
    "RestrictNamespaces": "yes",
    "RestrictRealtime": "yes",
    "RestrictSUIDSGID": "yes",
    "LockPersonality": "yes",
    "SystemCallArchitectures": "native",
    "SystemCallFilter": "@system-service",
    "CapabilityBoundingSet": "",
    "AmbientCapabilities": "",
}


# ---------------------------------------------------------------------------
# Parsing
# ---------------------------------------------------------------------------

def parse_unit(text: str) -> dict[str, list[tuple[str, str]]]:
    """A systemd unit as ``{section: [(key, value), ...]}``.

    A list rather than a dict because systemd does not treat repeated keys
    uniformly — ``Environment=`` accumulates while ``User=`` is last-wins —
    and flattening here would hide the difference from the checks below.

    Backslash continuations are joined, which is the only reason this cannot
    be ``configparser``: the ``ExecStart`` lines wrap.
    """
    sections: dict[str, list[tuple[str, str]]] = {}
    current: str | None = None
    pending = ""

    for raw in text.splitlines():
        line = raw.strip()
        if not pending and (not line or line[0] in "#;"):
            continue
        if pending:
            line = f"{pending} {line}"
            pending = ""
        if line.endswith("\\"):
            pending = line[:-1].strip()
            continue
        if line.startswith("[") and line.endswith("]"):
            current = line[1:-1]
            sections.setdefault(current, [])
            continue
        assert current is not None, f"key outside any section: {line!r}"
        key, _, value = line.partition("=")
        sections[current].append((key.strip(), value.strip()))

    assert not pending, "unit ends with a dangling line continuation"
    return sections


def entries(unit: dict, section: str, key: str) -> list[str]:
    return [v for k, v in unit.get(section, []) if k == key]


def entry(unit: dict, section: str, key: str) -> str:
    """The effective value of a last-wins directive."""
    found = entries(unit, section, key)
    assert found, f"[{section}] {key}= is missing"
    return found[-1]


def matched(pattern: str, text: str, *, flags: int = 0) -> re.Match[str]:
    """``re.search`` that fails the test rather than returning ``None``.

    Every search in this file is over a config file that is supposed to
    contain the thing being searched for, so a miss is the finding — and
    ``AttributeError: 'NoneType' has no attribute 'group'`` is a poor way to
    report it.
    """
    found = re.search(pattern, text, flags)
    assert found is not None, f"no match for {pattern!r}"
    return found


def parse_env_file(text: str) -> dict[str, str]:
    """``KEY=value`` lines, as systemd's ``EnvironmentFile=`` reads them."""
    values: dict[str, str] = {}
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        key, sep, value = line.partition("=")
        assert sep, f"not a KEY=value line: {line!r}"
        values[key.strip()] = value.strip()
    return values


@pytest.fixture(scope="module")
def caddyfile() -> str:
    return CADDYFILE.read_text()


@pytest.fixture(scope="module")
def env_example() -> dict[str, str]:
    return parse_env_file(ENV_EXAMPLE.read_text())


@pytest.fixture(scope="module")
def units() -> dict[str, dict]:
    return {name: parse_unit((SYSTEMD / name).read_text()) for name in SERVICE_UNITS}


def settings_from(values: dict[str, str], **overrides: str) -> Settings:
    """Build the real Settings from an env-file mapping.

    ``_env_file=None`` stops pydantic-settings reading the repository's own
    ``.env``, and init kwargs outrank ``os.environ``, so what comes back is the
    template and nothing else — not the suite's own test configuration.
    """
    merged = {k.lower(): v for k, v in {**values, **overrides}.items()}
    return Settings(_env_file=None, **merged)  # type: ignore[call-arg]


# ---------------------------------------------------------------------------
# The files exist and parse
# ---------------------------------------------------------------------------

class TestTheManifestsAreThere:
    @pytest.mark.parametrize(
        "path",
        [CADDYFILE, ENV_EXAMPLE, DEPLOY_SCRIPT, TARGET, DEPLOY / "README.md"],
        ids=lambda p: p.name,
    )
    def test_a_manifest_exists(self, path):
        assert path.is_file(), f"{path.relative_to(REPO_ROOT)} is missing"

    @pytest.mark.parametrize("name", SERVICE_UNITS)
    def test_a_unit_exists_and_parses(self, name):
        unit = parse_unit((SYSTEMD / name).read_text())
        assert set(unit) == {"Unit", "Service", "Install"}

    def test_the_target_declares_every_service(self):
        target = parse_unit(TARGET.read_text())
        wanted = " ".join(entries(target, "Unit", "Wants")).split()
        assert set(wanted) == set(SERVICE_UNITS)

    @pytest.mark.parametrize("name", SERVICE_UNITS)
    def test_a_unit_installs_into_the_target(self, name, units):
        # Both halves are needed and they do different things: WantedBy is what
        # `systemctl enable` writes, PartOf is what makes `systemctl restart
        # gstbot.target` reach this unit. A unit with only the first starts
        # with the stack and then never restarts with it again.
        assert entry(units[name], "Install", "WantedBy") == "gstbot.target"
        assert entry(units[name], "Unit", "PartOf") == "gstbot.target"


# ---------------------------------------------------------------------------
# The units run as the service account, in a sandbox
# ---------------------------------------------------------------------------

class TestTheUnitsAreConfined:
    @pytest.mark.parametrize("name", SERVICE_UNITS)
    def test_a_unit_runs_as_the_service_account(self, name, units):
        assert entry(units[name], "Service", "User") == "gstbot"
        assert entry(units[name], "Service", "Group") == "gstbot"

    @pytest.mark.parametrize("name", SERVICE_UNITS)
    @pytest.mark.parametrize("directive", sorted(HARDENING))
    def test_a_unit_sets_a_hardening_directive(self, name, directive, units):
        assert entry(units[name], "Service", directive) == HARDENING[directive]

    @pytest.mark.parametrize("name", SERVICE_UNITS)
    def test_a_unit_can_still_open_the_sockets_it_needs(self, name, units):
        # RestrictAddressFamilies is the one hardening directive that is easy
        # to get wrong in the direction of breaking the app rather than
        # loosening it: without AF_UNIX, Python's own resolver and any
        # loopback socket activation fail in ways that read as a DNS problem.
        families = entry(units[name], "Service", "RestrictAddressFamilies").split()
        assert set(families) == {"AF_INET", "AF_INET6", "AF_UNIX"}

    @pytest.mark.parametrize("name", SERVICE_UNITS)
    def test_a_unit_gets_a_writable_state_directory(self, name, units):
        # The single writable path under ProtectSystem=strict. Without it the
        # API's startup probe finds UPLOAD_DIR unwritable and every upload 500s.
        assert entry(units[name], "Service", "StateDirectory") == "gstbot"

    @pytest.mark.parametrize("name", SERVICE_UNITS)
    def test_a_unit_reads_the_one_environment_file(self, name, units):
        assert entry(units[name], "Service", "EnvironmentFile") == "/etc/gstbot/gstbot.env"

    @pytest.mark.parametrize("name", SERVICE_UNITS)
    def test_a_unit_does_not_write_bytecode(self, name, units):
        # /srv is read-only to these processes. Left unset, every import
        # attempts a .pyc write that fails, which is noise at best.
        assert "PYTHONDONTWRITEBYTECODE=1" in entries(units[name], "Service", "Environment")


# ---------------------------------------------------------------------------
# Ordering: the schema is migrated once, before anything queries it
# ---------------------------------------------------------------------------

class TestTheStackStartsInOrder:
    def test_migrations_are_a_one_shot_that_stays_active(self):
        unit = parse_unit((SYSTEMD / "gstbot-migrate.service").read_text())
        assert entry(unit, "Service", "Type") == "oneshot"
        # Without RemainAfterExit the unit deactivates the moment alembic
        # returns, and the API's Requires= on it would restart it on every
        # API restart — a second `alembic upgrade` racing a running stack.
        assert entry(unit, "Service", "RemainAfterExit") == "yes"
        # A failed migration must stop the release, not retry into a loop.
        assert entry(unit, "Service", "Restart") == "no"

    @pytest.mark.parametrize("name", ["gstbot-api.service", "gstbot-worker.service"])
    def test_a_serving_unit_waits_for_the_migration(self, name, units):
        assert entry(units[name], "Unit", "Requires") == "gstbot-migrate.service"
        assert "gstbot-migrate.service" in entry(units[name], "Unit", "After")

    @pytest.mark.parametrize("name", ["gstbot-api.service", "gstbot-worker.service"])
    def test_a_serving_unit_restarts_but_not_forever(self, name, units):
        assert entry(units[name], "Service", "Restart") == "always"
        assert int(entry(units[name], "Service", "StartLimitBurst")) > 0

    def test_only_the_migration_unit_runs_alembic(self, units):
        # The container entrypoint refuses to migrate from the worker for the
        # same reason. Two `alembic upgrade` processes against one database is
        # how a schema ends up half-applied.
        running_alembic = [
            name
            for name, unit in units.items()
            if any("alembic" in v for v in entries(unit, "Service", "ExecStart"))
        ]
        assert running_alembic == ["gstbot-migrate.service"]


# ---------------------------------------------------------------------------
# The commands in ExecStart address code that exists
# ---------------------------------------------------------------------------

class TestTheUnitsRunThisApplication:
    def test_the_api_serves_the_asgi_app_this_repo_defines(self, units):
        command = entry(units["gstbot-api.service"], "Service", "ExecStart")
        assert "app.main:app" in command

        module, _, attribute = "app.main:app".partition(":")
        imported = __import__(module, fromlist=[attribute])
        assert hasattr(imported, attribute)

    def test_the_worker_runs_the_celery_app_this_repo_defines(self, units):
        command = entry(units["gstbot-worker.service"], "Service", "ExecStart")
        assert "-A app.celery_app" in command

        from app.celery_app import celery_app

        assert celery_app.main == "gstbot"

    @pytest.mark.parametrize("name", SERVICE_UNITS)
    def test_a_unit_runs_from_the_deployed_checkout(self, name, units):
        assert entry(units[name], "Service", "WorkingDirectory") == "/srv/gstbot/src/backend"

    @pytest.mark.parametrize("name", SERVICE_UNITS)
    def test_a_unit_uses_an_absolute_path_into_the_deployed_virtualenv(self, name, units):
        command = entry(units[name], "Service", "ExecStart")
        assert command.startswith("/srv/gstbot/venv/bin/"), command

    def test_the_api_binds_the_loopback_only(self, units):
        # The single most consequential line in these files. On 0.0.0.0 the
        # Hetzner public address would serve the API unencrypted on 8000
        # alongside the TLS one, and every rate limit keyed on a forwarded
        # header would be forgeable by connecting straight to it.
        command = entry(units["gstbot-api.service"], "Service", "ExecStart")
        assert "--host 127.0.0.1" in command
        assert "0.0.0.0" not in command

    def test_the_api_honours_forwarded_headers_only_from_the_edge(self, units):
        # TRUST_PROXY_HEADERS=true is only safe because of this: uvicorn
        # rewrites the client address from X-Forwarded-For for peers on this
        # list and nobody else. A '*' here with the env file's setting would
        # let any caller pick its own rate-limit bucket.
        command = entry(units["gstbot-api.service"], "Service", "ExecStart")
        assert "--proxy-headers" in command
        assert "--forwarded-allow-ips=127.0.0.1" in command
        assert "--forwarded-allow-ips=*" not in command

    @pytest.mark.parametrize(
        ("name", "variable"),
        [
            ("gstbot-api.service", "WEB_CONCURRENCY"),
            ("gstbot-worker.service", "CELERY_CONCURRENCY"),
        ],
    )
    def test_a_tunable_has_a_default_in_the_unit(self, name, variable, units):
        # systemd expands ${VAR} to the empty string when it is unset, which
        # would hand uvicorn a bare `--workers` and fail the start. The unit
        # sets a default; the EnvironmentFile is read afterwards and wins.
        keys = [k for k, _ in units[name]["Service"]]
        defaults = " ".join(entries(units[name], "Service", "Environment"))

        assert f"{variable}=" in defaults, f"{variable} has no Environment= default"
        assert keys.index("Environment") < keys.index("EnvironmentFile"), (
            "EnvironmentFile must come after Environment= or it cannot override it"
        )


# ---------------------------------------------------------------------------
# The production template
# ---------------------------------------------------------------------------

class TestTheEnvironmentTemplate:
    def test_it_refuses_to_boot_as_shipped(self, env_example):
        # A template that started is a template somebody would have left
        # alone. This one fails the production JWT length check.
        with pytest.raises(ValidationError) as caught:
            settings_from(env_example)
        assert "JWT_SECRET" in str(caught.value)

    def test_every_placeholder_is_obvious(self, env_example):
        placeholders = {k for k, v in env_example.items() if "REPLACE_ME" in v}
        # Exactly these three. A fourth would mean a secret was added without
        # a line in the README's setup step; a missing one would mean a real
        # value had been committed.
        assert placeholders == {"JWT_SECRET", "DATABASE_URL", "OPENROUTER_API_KEY"}

    def test_it_boots_clean_once_the_secret_is_filled_in(self, env_example):
        settings = settings_from(env_example, JWT_SECRET=secrets.token_urlsafe(64))

        assert settings.is_production
        # The whole point of the template: nothing to warn about at boot. A
        # deployment that warns on startup is one where somebody has stopped
        # reading the warnings.
        assert validate_startup_config(settings) == []

    def test_it_serves_no_schema_and_no_debug(self, env_example):
        settings = settings_from(env_example, JWT_SECRET=secrets.token_urlsafe(64))

        assert settings.debug is False
        assert settings.docs_enabled is False
        assert settings.log_format == "json"

    def test_its_only_cors_origin_is_the_site_caddy_serves(self, env_example, caddyfile):
        settings = settings_from(env_example, JWT_SECRET=secrets.token_urlsafe(64))

        assert settings.cors_origins == [f"https://{SITE}"]
        assert matched(rf"^{re.escape(SITE)} \{{", caddyfile, flags=re.M), (
            "the Caddyfile does not define a site block for the CORS origin"
        )

    def test_uploads_land_in_the_one_writable_directory(self, env_example, units):
        settings = settings_from(env_example, JWT_SECRET=secrets.token_urlsafe(64))
        declared = entry(units["gstbot-api.service"], "Service", "StateDirectory")
        state_directory = f"/var/lib/{declared}"

        # Anywhere else and ProtectSystem=strict makes the first upload fail.
        assert settings.upload_dir.startswith(state_directory + "/"), settings.upload_dir

    def test_every_backing_service_is_reached_over_the_loopback(self, env_example):
        settings = settings_from(env_example, JWT_SECRET=secrets.token_urlsafe(64))

        for url in (
            settings.database_url,
            settings.redis_url,
            settings.celery_broker_url,
            settings.celery_result_backend,
        ):
            assert "127.0.0.1" in url, f"{url} is not on the loopback"

    def test_the_connection_ceiling_fits_a_stock_postgres(self, env_example):
        settings = settings_from(env_example, JWT_SECRET=secrets.token_urlsafe(64))
        api_workers = int(env_example["WEB_CONCURRENCY"])
        celery_workers = int(env_example["CELERY_CONCURRENCY"])
        per_process = settings.db_pool_size + settings.db_max_overflow

        # Postgres ships with max_connections=100 and reserves 3 for
        # superusers. Exceeding it does not degrade — it refuses connections,
        # which is an outage, and the arithmetic is easy to get wrong when
        # raising WEB_CONCURRENCY looks like a free knob.
        assert (api_workers + celery_workers) * per_process <= 97


# ---------------------------------------------------------------------------
# The edge
# ---------------------------------------------------------------------------

class TestTheCaddyfile:
    def test_it_proxies_the_api_to_the_port_the_unit_listens_on(self, caddyfile, units):
        upstream = matched(r"reverse_proxy\s+(\S+)", caddyfile)

        command = entry(units["gstbot-api.service"], "Service", "ExecStart")
        port = matched(r"--port (\d+)", command).group(1)
        assert upstream.group(1) == f"127.0.0.1:{port}"

    def test_only_the_api_prefix_is_proxied(self, caddyfile):
        # Everything else is the SPA. A broader matcher would put the static
        # files behind the Python process for no reason.
        assert matched(r"handle /api/\* \{", caddyfile)

    def test_it_serves_the_web_root_the_deploy_script_publishes(self, caddyfile):
        roots = set(re.findall(r"root \* (\S+)", caddyfile))
        assert roots == {"/srv/gstbot/web"}
        assert 'WEB="$ROOT/web"' in DEPLOY_SCRIPT.read_text()

    def test_it_falls_back_to_the_spa_entry_point(self, caddyfile):
        # /invoices/42 is a React route. Without this it is a 404.
        assert "try_files {path} /index.html" in caddyfile

    def test_it_accepts_a_body_larger_than_the_application_will(self, caddyfile, env_example):
        edge_mb = int(matched(r"max_size (\d+)MB", caddyfile).group(1))
        app_mb = int(env_example["MAX_UPLOAD_MB"])

        # The limit a user meets should be the application's, which answers
        # with a JSON error the UI can render. Caddy's exists to stop a
        # multi-gigabyte body reaching Python at all, and if it were the
        # lower of the two every oversized upload would be an opaque 413.
        assert edge_mb > app_mb, f"edge accepts {edge_mb}MB, app accepts {app_mb}MB"

    def test_it_sends_hsts(self, caddyfile, env_example):
        max_age = int(matched(r'Strict-Transport-Security "max-age=(\d+)', caddyfile).group(1))
        assert max_age >= 31536000
        # The application sends the same header; Caddy replaces rather than
        # appends, so this only agrees rather than duplicates.
        assert env_example["HSTS_ENABLED"] == "true"

    def test_it_does_not_touch_the_api_response_headers(self, caddyfile):
        # The API's own CSP is `default-src 'none'`, which is stricter than
        # anything appropriate for a page. A site-wide header block would
        # overwrite it with the SPA's and quietly loosen every API response.
        api_block = matched(r"handle /api/\* \{(.*?)\n\t\}", caddyfile, flags=re.S)
        assert "Content-Security-Policy" not in api_block.group(1)

    def test_the_spa_policy_allows_no_script_it_did_not_ship(self, caddyfile):
        policy = matched(r'Content-Security-Policy "([^"]+)"', caddyfile).group(1)
        directives = dict(
            (part.split(None, 1) + [""])[:2]
            for part in (p.strip() for p in policy.split(";"))
            if part
        )

        assert directives["default-src"] == "'self'"
        assert directives["script-src"] == "'self'"
        assert "'unsafe-eval'" not in policy
        # Same-origin only. A script that did get onto the page still cannot
        # post a tenant's invoices anywhere else.
        assert directives["connect-src"] == "'self'"
        assert directives["frame-ancestors"] == "'none'"
        assert directives["object-src"] == "'none'"

    def test_the_spa_policy_admits_the_inline_styles_the_build_emits(self, caddyfile):
        # Several components compute a width through the style attribute (the
        # meters, the dashboard bars). Dropping 'unsafe-inline' from style-src
        # does not fail a test or a build — it silently flattens those to zero
        # in the browser, so the reason it is there is recorded here.
        policy = matched(r'Content-Security-Policy "([^"]+)"', caddyfile).group(1)
        style = matched(r"style-src ([^;]+)", policy).group(1)
        assert "'unsafe-inline'" in style

        frontend = REPO_ROOT / "frontend" / "src"
        inline = [
            path.relative_to(REPO_ROOT)
            for path in frontend.rglob("*.jsx")
            if ".test." not in path.name and "style={{" in path.read_text()
        ]
        assert inline, (
            "no component sets an inline style any more — drop 'unsafe-inline' "
            "from style-src in deploy/Caddyfile"
        )

    def test_hashed_assets_are_cached_and_the_entry_point_is_not(self, caddyfile):
        assets = matched(r"handle /assets/\* \{(.*?)\n\t\}", caddyfile, flags=re.S)
        assert "immutable" in assets.group(1)

        # index.html is the only file whose name does not change between
        # releases, so a cached copy pins the user to a bundle that the
        # symlink swap has already deleted.
        spa = caddyfile[caddyfile.index("handle {") :]
        assert 'Cache-Control "no-store"' in spa

    def test_it_passes_the_client_address_the_rate_limiter_reads(self, caddyfile):
        assert "header_up X-Real-IP {remote_host}" in caddyfile

    def test_it_waits_long_enough_for_an_inline_parse(self, caddyfile):
        read_timeout = matched(r"read_timeout (\d+)s", caddyfile)
        # An upload whose parse falls back to inline processing waits on a
        # free-tier model call; the app allows 90s for it.
        assert int(read_timeout.group(1)) >= 180

    @pytest.mark.skipif(
        subprocess.run(["which", "caddy"], capture_output=True).returncode != 0,
        reason="caddy is not installed; CI validates the file in the docker job",
    )
    def test_caddy_itself_accepts_the_file(self):
        result = subprocess.run(
            ["caddy", "validate", "--adapter", "caddyfile", "--config", str(CADDYFILE)],
            capture_output=True,
            text=True,
        )
        assert result.returncode == 0, result.stderr


class TestTheComposeEdgeAgreesToo:
    """The nginx in front of the compose stack has the same job as Caddy."""

    def test_nginx_accepts_a_body_larger_than_the_application_will(self):
        nginx = (REPO_ROOT / "frontend" / "nginx.conf").read_text()
        edge_mb = int(matched(r"client_max_body_size (\d+)m", nginx).group(1))

        compose = (REPO_ROOT / "docker-compose.yml").read_text()
        app_mb = int(matched(r"MAX_UPLOAD_MB: \$\{MAX_UPLOAD_MB:-(\d+)\}", compose).group(1))

        assert edge_mb > app_mb, f"nginx accepts {edge_mb}MB, app accepts {app_mb}MB"


# ---------------------------------------------------------------------------
# The release script
# ---------------------------------------------------------------------------

class TestTheDeployScript:
    @pytest.fixture(scope="class")
    def script(self) -> str:
        return DEPLOY_SCRIPT.read_text()

    def test_it_is_executable(self):
        assert DEPLOY_SCRIPT.stat().st_mode & stat.S_IXUSR, "chmod +x deploy/deploy.sh"

    def test_it_is_valid_bash(self):
        result = subprocess.run(
            ["bash", "-n", str(DEPLOY_SCRIPT)], capture_output=True, text=True
        )
        assert result.returncode == 0, result.stderr

    def test_it_stops_at_the_first_failure(self, script):
        # Without this a failed build carries on to the symlink swap and
        # publishes whatever was in the release directory.
        assert "set -euo pipefail" in script

    def test_it_migrates_before_it_swaps_the_frontend(self, script):
        # Order, not presence. A migration that fails after the swap leaves a
        # new frontend talking to an old schema.
        assert script.index("systemctl start gstbot-migrate.service") < script.index("mv -T")

    def test_it_publishes_the_frontend_atomically(self, script):
        # rename(2) on the symlink. Copying over the live root instead serves
        # a fresh index.html naming assets that are not on disk yet to
        # whoever loaded the page during the copy.
        assert 'ln -sfn "$RELEASE" "$WEB.tmp"' in script
        assert 'mv -T "$WEB.tmp" "$WEB"' in script

    def test_it_installs_the_frontend_from_the_lockfile(self, script):
        # `npm install` would resolve versions that were never tested. The
        # comment above that line in the script says so and names it, so the
        # search has to be over what actually runs.
        commands = "\n".join(
            line for line in script.splitlines() if not line.lstrip().startswith("#")
        )
        assert "npm ci" in commands
        assert not re.search(r"npm install\b", commands)

    def test_it_verifies_the_release_before_reporting_success(self, script):
        assert "/api/v1/health/ready" in script
        assert f"https://{SITE}/api/v1/health/live" in script

    def test_it_never_deletes_the_live_release(self, script):
        prune = script[script.index("Pruning old releases") :]
        assert 'readlink -f "$WEB"' in prune
        assert 'readlink -f "$old")" != "$current"' in prune


class TestTheRunbook:
    @pytest.fixture(scope="class")
    def readme(self) -> str:
        return (DEPLOY / "README.md").read_text()

    def test_it_documents_every_unit_it_ships(self, readme):
        # A unit added without a line here is one nobody knows to install.
        for name in (*SERVICE_UNITS, "gstbot.target"):
            assert name in readme, f"{name} is undocumented"

    def test_it_records_what_is_deliberately_absent(self, readme):
        # gstbot-beat and gstbot-web are named in FEATURE_DOC.md as planned
        # services and are not deployed. Leaving that unexplained reads as an
        # oversight to the next person, who then adds an idle beat process.
        assert "gstbot-beat.service" in readme
        assert "gstbot-web.service" in readme

    def test_the_absent_beat_unit_really_has_no_schedule_to_run(self):
        # The reason given in the README, asserted rather than trusted: the
        # day a periodic task lands, this fails and the unit gets written.
        from app.celery_app import celery_app

        assert not celery_app.conf.beat_schedule, (
            "a beat schedule now exists — deploy/systemd/ needs a gstbot-beat.service"
        )


class TestTheRepositoryDoesNotLeakSecrets:
    def test_no_filled_in_environment_file_is_committed(self):
        tracked = subprocess.run(
            ["git", "-C", str(REPO_ROOT), "ls-files"],
            capture_output=True,
            text=True,
            check=True,
        ).stdout.split()

        # .env.example and gstbot.env.example are templates and are meant to
        # be here; anything else matching is a real environment file.
        leaked = [
            path
            for path in tracked
            if os.path.basename(path).startswith(".env") or path.endswith(".env")
            if not path.endswith(".example")
        ]
        assert leaked == [], f"environment files are committed: {leaked}"
