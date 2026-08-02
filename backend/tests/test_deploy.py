"""Checks over the deployment manifests in ``deploy/``.

None of this runs on the server, so nothing here can prove the deployment
works. What it can prove is that the files agree with each other and with the
application — which is where this class of configuration actually goes wrong.
A port changed in a unit and not in the site block, an upload limit raised in
the env file past what the edge will accept, a module path that was renamed in
``app/`` months after the ``ExecStart`` line was written: each of those is
silent until a deploy, and each is a string comparison here.

The other half is the production configuration itself. ``gstbot.env.example``
is fed through the real ``Settings`` model, so the template ships in a state
that boots cleanly and logs no warnings — and the assertion that it does is
the same code path the server runs.

What makes this deployment unusual, and what most of the cross-checks below
exist for: **the box is shared**. Caddy is a container belonging to another
product, Postgres and Redis are shared clusters, and the ports are allocated
across four applications. So the failure mode is not only "GSTBot is
misconfigured" but "GSTBot collides with something already running" — a
duplicated Redis database, a port another product owns, a bind address the
containerised edge cannot reach. Those are the assertions with teeth here.
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

# A *site block*, not a Caddyfile. The edge on this host is `knol-caddy`, a
# container shared with the other products on the box, configured from one
# file (/opt/knol/Caddyfile) that this block is appended to. It happens to be
# a valid standalone Caddyfile as well, which is what lets CI parse it.
SITE_CONF = DEPLOY / "caddy-gstbot.conf"
ENV_EXAMPLE = DEPLOY / "gstbot.env.example"
DEPLOY_SCRIPT = DEPLOY / "deploy.sh"
STATIC_SERVER = DEPLOY / "static-server.mjs"
TARGET = SYSTEMD / "gstbot.target"

# The three units that run Python out of the deployed virtualenv.
PYTHON_UNITS = ("gstbot-migrate.service", "gstbot-api.service", "gstbot-worker.service")
# gstbot-web runs node, so it shares the sandbox and none of the Python
# plumbing. Kept apart rather than special-cased inside each test, so that the
# checks that are about "every unit" really are about every unit.
SERVICE_UNITS = (*PYTHON_UNITS, "gstbot-web.service")
# The units that stay up and serve, as opposed to the one-shot migration.
SERVING_UNITS = ("gstbot-api.service", "gstbot-web.service", "gstbot-worker.service")

# The one address this deployment answers on. Written out rather than derived,
# because "the site block and the CORS list agree" is only interesting if they
# agree on the right thing.
SITE = "gstbot.aiknol.com"

# The Docker bridge gateway. Both host processes bind it: reachable from the
# Caddy container, and not routed from the internet. See gstbot-api.service.
BRIDGE = "172.18.0.1"
# The Caddy container's own address on that bridge — the only peer whose
# X-Forwarded-* the API honours.
EDGE = "172.18.0.6"

# Where the tree lives on the server.
INSTALL_ROOT = "/opt/GSTBot"

# Redis databases on the shared instance. The README records who owns the
# others; these three are ours and must stay distinct from each other.
FOREIGN_REDIS_DBS = {0, 1, 3, 4, 5}

# Directives that make the unit's sandbox a sandbox. Asserted as a set across
# every unit rather than one by one: they run as the same user under the same
# supervisor, so a directive present on three units and missing from the
# fourth is an oversight, and that is the shape this catches.
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


def redis_db(url: str) -> int:
    """The database number from a ``redis://host:port/N`` URL."""
    return int(matched(r"redis://[^/]+/(\d+)\s*$", url).group(1))


@pytest.fixture(scope="module")
def site_conf() -> str:
    return SITE_CONF.read_text()


@pytest.fixture(scope="module")
def env_example() -> dict[str, str]:
    return parse_env_file(ENV_EXAMPLE.read_text())


@pytest.fixture(scope="module")
def units() -> dict[str, dict]:
    return {name: parse_unit((SYSTEMD / name).read_text()) for name in SERVICE_UNITS}


@pytest.fixture(scope="module")
def api_block(site_conf) -> str:
    """The ``handle @api { ... }`` body."""
    return matched(r"handle @api \{(.*?)\n\t\}", site_conf, flags=re.S).group(1)


@pytest.fixture(scope="module")
def spa_block(site_conf) -> str:
    """The catch-all ``handle { ... }`` body that fronts the SPA server."""
    return matched(r"\n\thandle \{(.*?)\n\t\}", site_conf, flags=re.S).group(1)


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
        [SITE_CONF, ENV_EXAMPLE, DEPLOY_SCRIPT, STATIC_SERVER, TARGET, DEPLOY / "README.md"],
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

    def test_no_unit_ships_without_being_declared(self):
        # The other direction. A unit file added to deploy/systemd/ and not
        # added to SERVICE_UNITS is one that nothing above checks — it would
        # be installed by the README's `install deploy/systemd/*` and then
        # never enabled, or enabled and never hardened.
        shipped = {p.name for p in SYSTEMD.iterdir() if p.suffix == ".service"}
        assert shipped == set(SERVICE_UNITS)

    @pytest.mark.parametrize("name", SERVICE_UNITS)
    def test_a_unit_installs_into_the_target(self, name, units):
        # Both halves are needed and they do different things: WantedBy is what
        # `systemctl enable` writes, PartOf is what makes `systemctl restart
        # gstbot.target` reach this unit. A unit with only the first starts
        # with the stack and then never restarts with it again.
        assert entry(units[name], "Install", "WantedBy") == "gstbot.target"
        assert entry(units[name], "Unit", "PartOf") == "gstbot.target"

    @pytest.mark.parametrize("name", SERVICE_UNITS)
    def test_a_unit_is_identifiable_in_a_shared_journal(self, name, units):
        # journald on this box carries four products. Without an explicit
        # identifier a unit's lines are tagged with the executable's basename,
        # so every Python service on the host logs as "python3" and the
        # `journalctl -t` in the runbook selects three applications at once.
        assert entry(units[name], "Service", "SyslogIdentifier") == name.removesuffix(".service")
        assert entry(units[name], "Service", "StandardOutput") == "journal"
        assert entry(units[name], "Service", "StandardError") == "journal"


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

    @pytest.mark.parametrize("name", PYTHON_UNITS)
    def test_a_python_unit_can_still_open_the_sockets_it_needs(self, name, units):
        # RestrictAddressFamilies is the one hardening directive that is easy
        # to get wrong in the direction of breaking the app rather than
        # loosening it: without AF_UNIX, Python's own resolver and any
        # loopback socket activation fail in ways that read as a DNS problem.
        families = entry(units[name], "Service", "RestrictAddressFamilies").split()
        assert set(families) == {"AF_INET", "AF_INET6", "AF_UNIX"}

    def test_the_web_unit_needs_no_unix_sockets(self, units):
        # Narrower than the Python units on purpose, and safe because of one
        # detail: node skips the resolver entirely when listen() is given an
        # IP literal, which the unit's --host is. Widen this the day that
        # ExecStart names a hostname instead, or the bind fails with
        # EAFNOSUPPORT and reads as a DNS outage.
        families = entry(units["gstbot-web.service"], "Service", "RestrictAddressFamilies").split()
        assert set(families) == {"AF_INET", "AF_INET6"}

        command = entry(units["gstbot-web.service"], "Service", "ExecStart")
        host = matched(r"--host (\S+)", command).group(1)
        assert re.fullmatch(r"[\d.]+", host), f"--host {host} needs a resolver, so AF_UNIX too"

    @pytest.mark.parametrize("name", PYTHON_UNITS)
    def test_a_python_unit_gets_a_writable_state_directory(self, name, units):
        # The single writable path under ProtectSystem=strict. Without it the
        # API's startup probe finds UPLOAD_DIR unwritable and every upload 500s.
        assert entry(units[name], "Service", "StateDirectory") == "gstbot"

    def test_the_web_unit_asks_for_no_writable_path(self, units):
        # It only ever reads, and what it reads is under /opt, which
        # ProtectSystem=strict leaves readable. A StateDirectory here would be
        # a writable directory owned by a process that has no reason to write.
        assert not entries(units["gstbot-web.service"], "Service", "StateDirectory")

    @pytest.mark.parametrize("name", PYTHON_UNITS)
    def test_a_python_unit_reads_the_one_environment_file(self, name, units):
        assert entry(units[name], "Service", "EnvironmentFile") == "/etc/gstbot/gstbot.env"

    def test_the_web_unit_is_given_no_secrets(self, units):
        # /etc/gstbot/gstbot.env holds the JWT signing key, the database
        # password and the OpenRouter key. A static file server has no use for
        # any of them, and reading them into its environment would put all
        # three in `/proc/<pid>/environ` for a process reachable from every
        # container on the bridge.
        assert not entries(units["gstbot-web.service"], "Service", "EnvironmentFile")

    @pytest.mark.parametrize("name", PYTHON_UNITS)
    def test_a_python_unit_does_not_write_bytecode(self, name, units):
        # /opt is read-only to these processes. Left unset, every import
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
    def test_a_unit_that_queries_the_schema_waits_for_the_migration(self, name, units):
        assert entry(units[name], "Unit", "Requires") == "gstbot-migrate.service"
        assert "gstbot-migrate.service" in entry(units[name], "Unit", "After")

    def test_the_web_unit_does_not_wait_for_the_migration(self, units):
        # It serves a directory of files and never opens the database, so
        # coupling it to the migration would take the whole SPA — including
        # the page that renders the API's own error — down with a failed
        # `alembic upgrade`.
        assert not entries(units["gstbot-web.service"], "Unit", "Requires")

    @pytest.mark.parametrize("name", SERVING_UNITS)
    def test_a_serving_unit_restarts_but_not_forever(self, name, units):
        assert entry(units[name], "Service", "Restart") == "always"
        assert int(entry(units[name], "Unit", "StartLimitBurst")) > 0

    @pytest.mark.parametrize("name", SERVING_UNITS)
    @pytest.mark.parametrize("directive", ["StartLimitIntervalSec", "StartLimitBurst"])
    def test_the_restart_limit_is_in_the_section_systemd_reads_it_from(
        self, name, directive, units
    ):
        # These moved from [Service] to [Unit] in systemd v229. Left in
        # [Service] they are not an error — systemd logs "Unknown key name"
        # and carries on, so the unit starts, reports active, and rate-limits
        # restarts on the 10s default instead of the 300s written down. An
        # earlier version of this file asserted the value and passed the whole
        # time it was inert, which is why the section is asserted and not just
        # the number.
        assert entries(units[name], "Unit", directive), f"{directive} is not in [Unit]"
        assert not entries(units[name], "Service", directive), (
            f"{directive} in [Service] is ignored by systemd"
        )

    @pytest.mark.parametrize("name", ["gstbot-api.service", "gstbot-web.service"])
    def test_a_unit_that_binds_the_bridge_waits_for_docker(self, name, units):
        # 172.18.0.1 does not exist until dockerd has created the knol_knol
        # bridge. Wants=/After= rather than Requires=: the bridge is a
        # dependency of the address, not of the application, and Restart=always
        # reaches the same place with less coupling if the bind does fail.
        assert "docker.service" in entry(units[name], "Unit", "After")
        assert "docker.service" in entry(units[name], "Unit", "Wants")
        assert "docker.service" not in " ".join(entries(units[name], "Unit", "Requires"))

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

    def test_the_web_unit_runs_the_server_this_repo_ships(self, units):
        # The whole reason this unit exists is a file in deploy/. A rename
        # there is otherwise silent until the release restarts it.
        command = entry(units["gstbot-web.service"], "Service", "ExecStart")
        script = matched(rf"{re.escape(INSTALL_ROOT)}/(\S+\.mjs)", command).group(1)
        assert (REPO_ROOT / script).is_file(), f"{script} is not in the repository"
        assert (REPO_ROOT / script) == STATIC_SERVER

    @pytest.mark.parametrize("name", PYTHON_UNITS)
    def test_a_python_unit_runs_from_the_deployed_checkout(self, name, units):
        assert entry(units[name], "Service", "WorkingDirectory") == f"{INSTALL_ROOT}/backend"

    @pytest.mark.parametrize("name", PYTHON_UNITS)
    def test_a_python_unit_uses_an_absolute_path_into_the_deployed_virtualenv(self, name, units):
        command = entry(units[name], "Service", "ExecStart")
        assert command.startswith(f"{INSTALL_ROOT}/.venv/bin/"), command

    def test_the_web_unit_uses_an_absolute_path_to_the_interpreter(self, units):
        # No virtualenv to be in: the server imports nothing but node builtins
        # on purpose, so the production box needs no npm install to serve the
        # SPA. What it does need is an absolute path — systemd runs with no
        # PATH inherited from a login shell, and a bare `node` would resolve
        # against systemd's own default.
        command = entry(units["gstbot-web.service"], "Service", "ExecStart")
        assert command.startswith("/usr/bin/node "), command

    def test_the_static_server_imports_nothing_that_needs_installing(self):
        # The claim above, asserted. An added dependency turns a release into
        # `npm ci` in deploy/ as well, which nothing in deploy.sh does.
        for module in re.findall(r'^import .*? from "([^"]+)";', STATIC_SERVER.read_text(), re.M):
            assert module.startswith("node:"), f"{module} is not a node builtin"

    @pytest.mark.parametrize("name", ["gstbot-api.service", "gstbot-web.service"])
    def test_a_listener_binds_the_bridge_and_not_the_world(self, name, units):
        # The single most consequential line in these files.
        #
        # 127.0.0.1 would be unreachable: Caddy terminates TLS from inside a
        # container, where loopback is the container itself. 0.0.0.0 would
        # publish the service unencrypted on the Hetzner public address
        # alongside the TLS one, and make every rate limit keyed on a
        # forwarded header forgeable by connecting to it directly. The bridge
        # gateway is reachable from the edge and not routed from the internet.
        command = entry(units[name], "Service", "ExecStart")
        assert f"--host {BRIDGE}" in command
        assert "0.0.0.0" not in command
        assert "--host 127.0.0.1" not in command

    def test_the_api_honours_forwarded_headers_only_from_the_edge(self, units):
        # TRUST_PROXY_HEADERS=true is only safe because of this: uvicorn
        # rewrites the client address from X-Forwarded-For for peers on this
        # list and nobody else.
        command = entry(units["gstbot-api.service"], "Service", "ExecStart")
        assert "--proxy-headers" in command

        allowed = matched(r"--forwarded-allow-ips=(\S+)", command).group(1).split(",")
        # One host, not a range and not a wildcard. This bridge carries every
        # other product on the box; widening it to the subnet would let any
        # container forge the client address the rate limiter buckets on.
        assert allowed == [EDGE], allowed
        assert "/" not in command.split("--forwarded-allow-ips=")[1].split()[0]

    def test_the_web_unit_serves_the_directory_the_release_builds(self, units):
        command = entry(units["gstbot-web.service"], "Service", "ExecStart")
        root = matched(r"--root (\S+)", command).group(1)

        assert root == f"{INSTALL_ROOT}/frontend/dist"
        # And that is the path the release script proves it wrote before it
        # restarts anything.
        assert '[ -f "$ROOT/frontend/dist/index.html" ]' in DEPLOY_SCRIPT.read_text()

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

    def test_every_expanded_variable_has_a_default(self, units):
        # The general form of the check above. systemd does not fail on an
        # unset ${VAR}; it substitutes nothing, so `--loglevel=` reaches the
        # process and celery exits on an argument error five seconds into a
        # release.
        for name in SERVICE_UNITS:
            command = entry(units[name], "Service", "ExecStart")
            defaults = " ".join(entries(units[name], "Service", "Environment"))
            for variable in re.findall(r"\$\{(\w+)\}", command):
                assert f"{variable}=" in defaults, f"{name}: ${{{variable}}} has no default"


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

    def test_its_only_cors_origin_is_the_site_the_edge_serves(self, env_example, site_conf):
        settings = settings_from(env_example, JWT_SECRET=secrets.token_urlsafe(64))

        assert settings.cors_origins == [f"https://{SITE}"]
        assert matched(rf"^{re.escape(SITE)} \{{", site_conf, flags=re.M), (
            "the site block does not define a site for the CORS origin"
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

    def test_the_three_redis_databases_are_distinct(self, env_example):
        settings = settings_from(env_example, JWT_SECRET=secrets.token_urlsafe(64))
        used = [
            redis_db(settings.redis_url),
            redis_db(settings.celery_broker_url),
            redis_db(settings.celery_result_backend),
        ]

        # Not a style point. The cache holds rate-limit counters, the broker
        # holds Kombu's queues and the result backend holds task results; on
        # one database a rate-limit key expiring and a queue key are the same
        # keyspace, and the cache's own flush would eat queued extractions.
        assert len(set(used)) == 3, f"two of {used} are the same Redis database"

    def test_no_redis_database_belongs_to_another_product(self, env_example):
        settings = settings_from(env_example, JWT_SECRET=secrets.token_urlsafe(64))
        used = {
            redis_db(settings.redis_url),
            redis_db(settings.celery_broker_url),
            redis_db(settings.celery_result_backend),
        }

        # This Redis is shared with three other products and has no access
        # control between numbered databases, so a collision is not a
        # permission error — it is two applications' keys interleaving, and a
        # FLUSHDB from either side taking both out. The owners are recorded in
        # the env template beside this setting.
        collisions = used & FOREIGN_REDIS_DBS
        assert not collisions, f"Redis {sorted(collisions)} is already another product's"

    def test_the_connection_ceiling_leaves_room_for_the_shared_cluster(self, env_example):
        settings = settings_from(env_example, JWT_SECRET=secrets.token_urlsafe(64))
        api_workers = int(env_example["WEB_CONCURRENCY"])
        celery_workers = int(env_example["CELERY_CONCURRENCY"])
        per_process = settings.db_pool_size + settings.db_max_overflow
        ours = (api_workers + celery_workers) * per_process

        # Postgres ships with max_connections=100 and reserves 3 for
        # superusers. Exceeding it does not degrade — it refuses connections,
        # which is an outage. And this cluster is shared, so the budget is not
        # ours alone: two thirds is the most GSTBot may claim of a stock
        # configuration before somebody raises max_connections deliberately.
        assert ours <= 65, f"GSTBot alone would hold {ours} of ~97 connections"


# ---------------------------------------------------------------------------
# The edge
# ---------------------------------------------------------------------------

class TestTheSiteBlock:
    def test_it_is_a_site_block_and_not_a_whole_caddyfile(self, site_conf):
        # It gets appended to /opt/knol/Caddyfile, which already has a global
        # options block at the top. A second one — or any global directive at
        # the file's left margin — makes the whole shared file invalid, which
        # takes down every site on the box and not only this one.
        assert matched(rf"\A(?:#[^\n]*\n|\s*\n)*{re.escape(SITE)} \{{", site_conf) is not None
        top_level = re.findall(r"^(\S.*?)\s*\{", site_conf, flags=re.M)
        assert top_level == [SITE], f"unexpected top-level block(s): {top_level}"

    def test_it_proxies_the_api_to_the_port_the_unit_listens_on(self, api_block, units):
        upstream = matched(r"reverse_proxy\s+(\S+)", api_block).group(1)

        command = entry(units["gstbot-api.service"], "Service", "ExecStart")
        port = matched(r"--port (\d+)", command).group(1)
        assert upstream == f"{BRIDGE}:{port}"

    def test_it_proxies_everything_else_to_the_spa_server(self, spa_block, units):
        upstream = matched(r"reverse_proxy\s+(\S+)", spa_block).group(1)

        command = entry(units["gstbot-web.service"], "Service", "ExecStart")
        port = matched(r"--port (\d+)", command).group(1)
        assert upstream == f"{BRIDGE}:{port}"

    def test_the_two_upstreams_are_not_the_same_port(self, units):
        ports = {
            name: matched(
                r"--port (\d+)", entry(units[name], "Service", "ExecStart")
            ).group(1)
            for name in ("gstbot-api.service", "gstbot-web.service")
        }
        assert len(set(ports.values())) == 2, ports

    def test_it_claims_no_port_another_product_owns(self, units):
        # 8000 is authmatic-agent's on this box. A unit that took it would
        # start or not depending on boot order, which is the worst version of
        # this failure: it works until a reboot.
        taken = {8000}
        for name in ("gstbot-api.service", "gstbot-web.service"):
            port = int(matched(
                r"--port (\d+)", entry(units[name], "Service", "ExecStart")
            ).group(1))
            assert port not in taken, f"{name} binds {port}, which is already allocated"

    def test_only_the_api_prefix_reaches_the_application(self, site_conf):
        # Everything else is the SPA. A broader matcher would put the static
        # files behind the Python process for no reason.
        assert matched(r"@api path /api/\*", site_conf)

    def test_it_accepts_a_body_larger_than_the_application_will(self, site_conf, env_example):
        edge_mb = int(matched(r"max_size (\d+)MB", site_conf).group(1))
        app_mb = int(env_example["MAX_UPLOAD_MB"])

        # The limit a user meets should be the application's, which answers
        # with a JSON error the UI can render. The edge's exists to stop a
        # multi-gigabyte body reaching Python at all, and if it were the
        # lower of the two every oversized upload would be an opaque 413.
        assert edge_mb > app_mb, f"edge accepts {edge_mb}MB, app accepts {app_mb}MB"

    def test_it_sends_hsts(self, site_conf, env_example):
        max_age = int(matched(r'Strict-Transport-Security "max-age=(\d+)', site_conf).group(1))
        assert max_age >= 31536000
        # The application sends the same header; Caddy replaces rather than
        # appends, so this only agrees rather than duplicates.
        assert env_example["HSTS_ENABLED"] == "true"

    def test_it_does_not_touch_the_api_response_headers(self, api_block):
        # The API's own CSP is `default-src 'none'`, which is stricter than
        # anything appropriate for a page. A site-wide header block would
        # overwrite it with the SPA's and quietly loosen every API response.
        assert "Content-Security-Policy" not in api_block
        assert not re.search(r"^\s*header \{", api_block, flags=re.M)

    def test_the_spa_policy_allows_no_script_it_did_not_ship(self, spa_block):
        policy = matched(r'Content-Security-Policy "([^"]+)"', spa_block).group(1)
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
        assert directives["base-uri"] == "'none'"

    def test_the_spa_policy_admits_the_inline_styles_the_build_emits(self, spa_block):
        # Several components compute a width through the style attribute (the
        # meters, the dashboard bars). Dropping 'unsafe-inline' from style-src
        # does not fail a test or a build — it silently flattens those to zero
        # in the browser, so the reason it is there is recorded here.
        policy = matched(r'Content-Security-Policy "([^"]+)"', spa_block).group(1)
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
            "from style-src in deploy/caddy-gstbot.conf"
        )

    def test_it_passes_the_client_address_the_rate_limiter_reads(self, api_block):
        assert "header_up X-Real-IP {remote_host}" in api_block

    def test_it_waits_long_enough_for_an_inline_parse(self, api_block):
        read_timeout = matched(r"read_timeout (\d+)s", api_block)
        # An upload whose parse falls back to inline processing waits on a
        # free-tier model call; the app allows 90s for it.
        assert int(read_timeout.group(1)) >= 180

    def test_it_health_checks_the_probe_that_touches_nothing(self, api_block):
        # /ready opens the database. Behind a single upstream, a readiness
        # based check only converts the app's own "database is down" JSON into
        # a bare 502 from the edge, which is strictly less information.
        assert "health_uri /api/v1/health/live" in api_block
        assert "/health/ready" not in api_block

    @pytest.mark.skipif(
        subprocess.run(["which", "caddy"], capture_output=True).returncode != 0,
        reason="caddy is not installed; CI validates the file in the deploy job",
    )
    def test_caddy_itself_accepts_the_file(self):
        result = subprocess.run(
            ["caddy", "validate", "--adapter", "caddyfile", "--config", str(SITE_CONF)],
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

    @pytest.fixture(scope="class")
    def commands(self, script) -> str:
        """The script with its comments stripped.

        Several assertions below are about what the script *runs*. The
        comments quote the commands they explain, so searching the whole file
        would pass on a line that only exists in prose.
        """
        return "\n".join(
            line for line in script.splitlines() if not line.lstrip().startswith("#")
        )

    def test_it_is_executable(self):
        assert DEPLOY_SCRIPT.stat().st_mode & stat.S_IXUSR, "chmod +x deploy/deploy.sh"

    def test_it_is_valid_bash(self):
        result = subprocess.run(
            ["bash", "-n", str(DEPLOY_SCRIPT)], capture_output=True, text=True
        )
        assert result.returncode == 0, result.stderr

    def test_it_stops_at_the_first_failure(self, script):
        # Without this a failed build carries on to the restart and publishes
        # whatever happened to be in dist/.
        assert "set -euo pipefail" in script

    def test_it_targets_the_directory_the_units_run_from(self, commands, units):
        assert f"ROOT={INSTALL_ROOT}" in commands
        # And that is the parent of every unit's WorkingDirectory.
        for name in PYTHON_UNITS:
            assert entry(units[name], "Service", "WorkingDirectory").startswith(INSTALL_ROOT)

    def test_it_builds_before_it_migrates(self, commands):
        # Order, not presence. The frontend build is the step most likely to
        # fail and the only one with no side effect on the database; running
        # it first means a broken build costs nothing but the operator's time.
        assert commands.index("npm ci") < commands.index("systemctl restart gstbot-migrate")

    def test_it_migrates_before_it_restarts_anything(self, commands):
        # A migration that fails after the restart leaves new code talking to
        # an old schema.
        assert commands.index("systemctl restart gstbot-migrate.service") < commands.index(
            "systemctl restart gstbot-api.service"
        )

    def test_it_restarts_the_migration_rather_than_starting_it(self, commands):
        # gstbot-migrate is RemainAfterExit=yes, so it is already "active"
        # from the last release and `systemctl start` is a silent no-op — the
        # release would report success having run no migration at all.
        assert "systemctl restart gstbot-migrate.service" in commands
        assert not re.search(r"systemctl start gstbot-migrate", commands)

    def test_it_restarts_every_serving_unit(self, commands):
        # Naming them rather than restarting the target, because the target
        # would also restart gstbot-migrate a second time. A unit left out
        # here keeps serving the previous release's code.
        restarts = matched(r"systemctl restart (gstbot-api[^\n]*)", commands).group(1)
        for name in SERVING_UNITS:
            assert name in restarts, f"{name} is not restarted by a release"

    def test_it_proves_the_build_produced_something_before_restarting(self, commands):
        # `npm run build` can exit 0 having written nothing useful, and the
        # web unit would then restart onto an empty directory and 404 the
        # whole site. Cheaper to notice here.
        assert commands.index("index.html") < commands.index("systemctl restart")

    def test_it_installs_the_backend_from_the_lock(self, commands):
        # The mirror of `npm ci` for Python. requirements.txt is floors, so
        # installing from it resolves whatever PyPI published that morning and
        # the release is not the thing CI ran. --require-hashes is what makes
        # the pin an assertion rather than a preference.
        assert "requirements.lock" in commands
        assert "--require-hashes" in commands
        assert not re.search(r"-r \S*requirements\.txt", commands), (
            "a release must not resolve the floors; that is what the lock is for"
        )

    def test_it_installs_the_frontend_from_the_lockfile(self, commands):
        # `npm install` would resolve versions that were never tested. The
        # comment above that line in the script says so and names it, so the
        # search has to be over what actually runs.
        assert "npm ci" in commands
        assert not re.search(r"npm install\b", commands)

    def test_it_caps_the_build_heap(self, commands):
        # The box is 4 GB and shared. Node sizes its default heap from total
        # RAM, so an uncapped build gets OOM-killed at the rollup stage — and
        # an OOM kill during `npm run build` reports as a bare signal, not as
        # anything naming memory.
        assert "--max-old-space-size" in commands

    def test_it_verifies_the_release_before_reporting_success(self, commands, units):
        # All three: the API on the bridge, the SPA on the bridge, and the
        # site through Caddy. The last is the only one that proves the edge
        # was reloaded with this site block in it.
        api_port = matched(
            r"--port (\d+)", entry(units["gstbot-api.service"], "Service", "ExecStart")
        ).group(1)
        web_port = matched(
            r"--port (\d+)", entry(units["gstbot-web.service"], "Service", "ExecStart")
        ).group(1)

        assert f"http://{BRIDGE}:{api_port}/api/v1/health/ready" in commands
        assert f"http://{BRIDGE}:{web_port}/" in commands
        assert f"https://{SITE}/api/v1/health/live" in commands

    def test_every_health_check_can_fail_the_release(self, commands):
        # `curl` without -f exits 0 on a 500, so a check written that way
        # reports a healthy release for a stack that is answering with
        # nothing but errors.
        for line in commands.splitlines():
            if "curl" in line:
                assert "-fsS" in line, f"curl without -f cannot fail: {line.strip()}"
                assert "--max-time" in line, f"curl without a timeout can hang: {line.strip()}"


class TestTheRunbook:
    @pytest.fixture(scope="class")
    def readme(self) -> str:
        return (DEPLOY / "README.md").read_text()

    def test_it_documents_every_unit_it_ships(self, readme):
        # A unit added without a line here is one nobody knows to install.
        for name in (*SERVICE_UNITS, "gstbot.target"):
            assert name in readme, f"{name} is undocumented"

    def test_it_documents_the_edge_file_by_the_name_it_has(self, readme):
        assert SITE_CONF.name in readme

    def test_it_records_what_is_deliberately_absent(self, readme):
        # gstbot-beat is named in FEATURE_DOC.md as a planned service and is
        # not deployed. Leaving that unexplained reads as an oversight to the
        # next person, who then adds an idle beat process.
        assert "gstbot-beat.service" in readme

    def test_the_absent_beat_unit_really_has_no_schedule_to_run(self):
        # The reason given in the README, asserted rather than trusted: the
        # day a periodic task lands, this fails and the unit gets written.
        from app.celery_app import celery_app

        assert not celery_app.conf.beat_schedule, (
            "a beat schedule now exists — deploy/systemd/ needs a gstbot-beat.service"
        )

    def test_it_names_the_shared_dependencies_as_shared(self, readme):
        # The one thing about this box a newcomer cannot infer from the files:
        # Postgres, Redis and the edge belong to four products. Every
        # destructive operation in an incident — FLUSHALL, a Caddyfile edit, a
        # cluster restart — is wider than it looks.
        assert "FLUSHALL" in readme
        assert "/opt/knol/Caddyfile" in readme


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

    def test_no_private_key_is_committed(self):
        # The README's rsync step names an SSH key by path. A key that got
        # copied into the tree instead of referenced from outside it would be
        # pushed to the server and to GitHub in the same motion.
        tracked = subprocess.run(
            ["git", "-C", str(REPO_ROOT), "ls-files", "-z"],
            capture_output=True,
            text=True,
            check=True,
        ).stdout.split("\0")

        leaked = []
        for path in filter(None, tracked):
            if path.endswith((".pem", ".key", ".p12", ".pfx")) or "id_ed25519" in path:
                leaked.append(path)
                continue
            full = REPO_ROOT / path
            try:
                head = full.read_bytes()[:64]
            except OSError:  # pragma: no cover - a tracked file that is gone
                continue
            if b"-----BEGIN" in head and b"PRIVATE KEY" in head:
                leaked.append(path)

        assert leaked == [], f"private keys are committed: {leaked}"
