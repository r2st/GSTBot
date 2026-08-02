"""The workflow that is supposed to be checking everything else.

Two things go wrong with a CI file, and neither of them shows up as a failing
run — which is the whole problem, because a failing run is the only signal
anyone is watching for.

The first is a check that was never added. ``deploy/`` ships a Caddyfile, four
systemd units and a release script, and none of them is exercised by importing
the application, so none of them was parsed by anything until the ``deploy``
job existed. A missing brace in the Caddyfile is not a test failure; it is
``systemctl reload caddy`` failing partway through a release.

The second is a version that drifted apart. CI installs one Python, the image
builds on the one in its Dockerfile, and the server installs the one the
runbook names. Nothing makes those the same number, and when they stop being
the same number the suite goes on passing against a runtime nobody deploys.

So everything here reads the workflow as data and asserts that what runs is
what some other file in the repository already claims runs.
"""
from __future__ import annotations

import re
from pathlib import Path

import pytest
import yaml

BACKEND = Path(__file__).resolve().parent.parent
REPO_ROOT = BACKEND.parent
WORKFLOW = REPO_ROOT / ".github" / "workflows" / "ci.yml"
DEPLOY = REPO_ROOT / "deploy"


@pytest.fixture(scope="module")
def workflow() -> dict:
    return yaml.safe_load(WORKFLOW.read_text())


@pytest.fixture(scope="module")
def jobs(workflow) -> dict:
    return workflow["jobs"]


def commands(job: dict) -> str:
    """Every shell command a job runs, as one blob to search.

    Which step a command lives in is not interesting to any assertion below —
    only whether the job runs it at all — and joining them means a step that
    gets split in two does not fail a test that has nothing to do with it.
    """
    return "\n".join(step["run"] for step in job["steps"] if "run" in step)


def triggers(workflow: dict) -> dict:
    """The ``on:`` block.

    PyYAML follows YAML 1.1, where a bare ``on`` is the boolean true rather
    than the string — so this key is ``True`` after a round trip through
    ``safe_load``, and every naive ``workflow["on"]`` raises KeyError. GitHub
    reads it as a string. Both spellings are accepted here so that quoting the
    key in the workflow later does not break this file.
    """
    return workflow.get("on", workflow.get(True))


# ---------------------------------------------------------------------------
# The workflow itself
# ---------------------------------------------------------------------------

class TestTheWorkflowIsWiredUp:
    def test_it_gates_the_branch_that_gets_deployed(self, workflow):
        # main is what reaches the server: deploy.sh releases the tree rsync'd
        # from it, and fetches origin/main when the box can reach the remote.
        # A workflow that only ran on pull requests would leave the branch the
        # server installs from as the one thing nothing checks.
        on = triggers(workflow)
        assert "main" in on["push"]["branches"]
        assert "main" in on["pull_request"]["branches"]

    def test_it_reads_and_writes_nothing(self, workflow):
        # The default token is read/write on everything. None of these jobs
        # push, comment or tag, so the whole workflow runs read-only.
        assert workflow["permissions"] == {"contents": "read"}

    @pytest.mark.parametrize("name", ["backend", "frontend", "docker", "deploy"])
    def test_a_job_exists(self, name, jobs):
        assert name in jobs

    def test_every_job_gives_up_eventually(self, jobs):
        # A step that hangs — a pull that stalls, a test that waits on a socket
        # — runs for six hours on the default timeout, and does it on every
        # push until somebody notices the bill.
        missing = [name for name, job in jobs.items() if "timeout-minutes" not in job]
        assert missing == []


# ---------------------------------------------------------------------------
# The deployment manifests are parsed by the tools that will parse them
# ---------------------------------------------------------------------------

class TestEveryManifestIsRunThroughItsOwnTool:
    """``test_deploy.py`` checks these files against each other and against the
    application. It cannot check them against their own parsers, because none
    of those parsers is installed here. This is the other half."""

    @pytest.fixture(scope="class")
    def deploy_job(self, jobs) -> str:
        return commands(jobs["deploy"])

    def test_the_caddyfile_is_validated_by_caddy(self, deploy_job):
        assert "caddy validate" in deploy_job
        assert "deploy/caddy-gstbot.conf" in deploy_job

    def test_the_caddyfile_is_held_to_caddys_own_formatting(self, deploy_job):
        # Not tidiness. `caddy validate` downgrades a formatting complaint to a
        # warning and repeats it on every reload, so without a check that
        # fails, the file accumulates a permanent warning and the next real one
        # arrives somewhere nobody is looking.
        assert "caddy fmt" in deploy_job

    def test_the_units_are_validated_by_systemd(self, deploy_job):
        # The one check that catches a misspelled hardening directive. systemd
        # ignores an unknown key, so `ProtectSytem=strict` is a unit that
        # starts, reports active, and confines nothing.
        assert "systemd-analyze verify" in deploy_job

    def test_the_release_script_is_shellchecked(self, deploy_job):
        assert "shellcheck deploy/deploy.sh" in deploy_job

    def test_every_unit_that_ships_is_covered_by_the_verify(self, deploy_job):
        # A glob rather than the four names, so a unit added tomorrow is
        # verified by the line that already exists — or this fails and says so.
        verify = next(
            line for line in deploy_job.splitlines() if "systemd-analyze verify" in line
        )
        for unit in sorted(p.name for p in (DEPLOY / "systemd").iterdir()):
            covered = unit in verify or re.search(
                rf"deploy/systemd/\*{re.escape(Path(unit).suffix)}\b", verify
            )
            assert covered, f"{unit} is not passed to systemd-analyze verify"


class TestTheMigrationsAreCheckedAgainstTheDatabaseTheyDeployAgainst:
    """The suite migrates SQLite; the server migrates Postgres.

    ``tests/test_migrations.py`` runs on a throwaway SQLite file by default and
    switches to whatever ``MIGRATION_TEST_DATABASE_URL`` names. That second run
    is the only place the rollback assertions ever meet a real ``ALTER TABLE``,
    and it lives entirely in the workflow — so it is the kind of check that can
    be dropped in an edit here without a single test going red.
    """

    @pytest.fixture(scope="class")
    def backend_job(self, jobs) -> dict:
        return jobs["backend"]

    def test_the_migration_module_is_re_run_against_postgres(self, backend_job):
        step = self._rerun_step(backend_job)
        assert step is not None, (
            "no step runs tests/test_migrations.py with MIGRATION_TEST_DATABASE_URL; "
            "the rollback checks only ever see SQLite"
        )

    def test_it_points_at_the_postgres_service_the_job_starts(self, backend_job):
        # A URL naming a database nothing started fails the step outright, but
        # one naming the *wrong* reachable database would quietly test somewhere
        # else. The service block is the only Postgres in this job.
        step = self._rerun_step(backend_job)
        assert step is not None
        url = step["env"]["MIGRATION_TEST_DATABASE_URL"]
        service = backend_job["services"]["postgres"]["env"]
        assert service["POSTGRES_DB"] in url
        assert service["POSTGRES_USER"] in url

    def test_it_runs_after_the_steps_that_need_a_migrated_database(self, backend_job):
        """Ordering is load-bearing, and silently so.

        The module's fixture wipes the shared database on the way out. Any step
        ordered after it that expects a schema — `alembic check`, today — finds
        an empty database and fails for a reason with nothing to do with it.
        """
        steps = backend_job["steps"]
        rerun = steps.index(self._rerun_step(backend_job))
        needs_schema = [
            index
            for index, step in enumerate(steps)
            if "run" in step and "alembic check" in step["run"]
        ]

        assert needs_schema, "expected an `alembic check` step to order against"
        assert all(index < rerun for index in needs_schema), (
            "the migration module wipes the database it is given; steps that "
            "need a migrated one have to come before it"
        )

    @staticmethod
    def _rerun_step(job: dict) -> dict | None:
        return next(
            (
                step
                for step in job["steps"]
                if "MIGRATION_TEST_DATABASE_URL" in (step.get("env") or {})
                and "tests/test_migrations.py" in step.get("run", "")
            ),
            None,
        )


# ---------------------------------------------------------------------------
# One runtime version, written down in four places
# ---------------------------------------------------------------------------

def sole(values: set[str], what: str) -> str:
    assert len(values) == 1, f"{what} disagree: {sorted(values)}"
    return values.pop()


class TestTheRuntimeVersionsAgree:
    @pytest.fixture(scope="class")
    def with_python(self, jobs) -> str:
        """The Python the suite is actually run on in CI."""
        step = next(
            s
            for s in jobs["backend"]["steps"]
            if s.get("uses", "").startswith("actions/setup-python")
        )
        return str(step["with"]["python-version"])

    @pytest.fixture(scope="class")
    def with_node(self, jobs) -> str:
        step = next(
            s
            for s in jobs["frontend"]["steps"]
            if s.get("uses", "").startswith("actions/setup-node")
        )
        return str(step["with"]["node-version"])

    def test_the_image_is_built_on_the_python_ci_tests_on(self, with_python):
        dockerfile = (REPO_ROOT / "backend" / "Dockerfile").read_text()
        stages = set(re.findall(r"^FROM python:(\S+?)-slim", dockerfile, flags=re.M))
        assert stages, "backend/Dockerfile does not build on a python: tag"
        # Both stages too: a build stage on one minor and a runtime stage on
        # another produces wheels the runtime cannot import for any dependency
        # that ships a compiled extension.
        assert sole(stages, "backend/Dockerfile python stages") == with_python

    def test_the_server_installs_the_python_ci_tests_on(self, with_python):
        # The runbook's apt line. A server on 3.11 running a suite that only
        # ever ran on 3.12 is a syntax error found by the first deploy.
        readme = (DEPLOY / "README.md").read_text()
        installed = set(re.findall(r"python(3\.\d+)", readme))
        assert sole(installed, "deploy/README.md python versions") == with_python

    def test_the_declared_floor_is_one_the_suite_has_run_on(self, with_python):
        pyproject = (BACKEND / "pyproject.toml").read_text()
        floor = re.search(r'requires-python = ">=(\d+\.\d+)"', pyproject)
        assert floor is not None
        # `>=3.11` while CI only ever runs 3.12 is a claim nothing backs. It is
        # allowed to be lower — the deployment resolves newer — but not higher.
        assert tuple(map(int, floor.group(1).split("."))) <= tuple(
            map(int, with_python.split("."))
        )

    def test_the_frontend_image_is_built_on_the_node_ci_tests_on(self, with_node):
        dockerfile = (REPO_ROOT / "frontend" / "Dockerfile").read_text()
        majors = set(re.findall(r"^FROM node:(\d+)", dockerfile, flags=re.M))
        assert sole(majors, "frontend/Dockerfile node stages") == with_node
