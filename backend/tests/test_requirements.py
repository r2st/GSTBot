"""The declared dependency floors against what is actually installed.

Every line in requirements.txt is a `>=` floor rather than a pin, so nothing
here checks that a particular version is present — the deployment is free to
resolve newer. What it checks is the other direction: that the floor is a claim
the environment can back up.

That matters because the floors are maintained by Dependabot, which raises them
without ever running the suite against the raised number. A bumped floor is
therefore an assertion nobody verified: the PR says "this project needs at least
alembic 1.18.5" while CI installs whatever pip resolves and the tests pass for
reasons unrelated to the floor. If the two drift — a floor raised above what is
resolvable, or a package dropped from the file but still imported — the failure
surfaces at `pip install` on a clean machine, which is the worst place for it.

Asserting floor <= installed catches the drift here instead, and makes the next
floor bump self-verifying: the suite either runs against a version that honours
the new floor or it goes red.
"""
from __future__ import annotations

from importlib.metadata import PackageNotFoundError, version
from pathlib import Path

import pytest
from packaging.requirements import Requirement

BACKEND = Path(__file__).resolve().parent.parent


def _requirements(filename: str) -> list[Requirement]:
    """Parse a requirements file, skipping comments, blanks and `-r` includes."""
    lines = (BACKEND / filename).read_text().splitlines()
    return [
        Requirement(stripped)
        for line in lines
        if (stripped := line.strip())
        # `-r requirements.txt` is followed on its own, by the caller passing
        # both filenames; recursing here would double every runtime package.
        if not stripped.startswith(("#", "-"))
    ]


RUNTIME = _requirements("requirements.txt")
DEV = _requirements("requirements-dev.txt")


def _ids(reqs: list[Requirement]) -> list[str]:
    return [req.name for req in reqs]


def _assert_floor_met(req: Requirement, source: str) -> None:
    try:
        installed = version(req.name)
    except PackageNotFoundError:  # pragma: no cover - a broken environment
        raise AssertionError(f"{req.name} is declared in {source} but not installed") from None
    assert req.specifier.contains(installed, prereleases=True), (
        f"{req.name} {installed} is installed but {source} asks for {req.specifier}"
    )


class TestEveryDeclaredFloorIsMet:
    """The installed distribution satisfies the version it is declared against."""

    @pytest.mark.parametrize("req", RUNTIME, ids=_ids(RUNTIME))
    def test_a_runtime_dependency_is_installed_at_or_above_its_floor(self, req):
        _assert_floor_met(req, "requirements.txt")

    @pytest.mark.parametrize("req", DEV, ids=_ids(DEV))
    def test_a_dev_dependency_is_installed_at_or_above_its_floor(self, req):
        _assert_floor_met(req, "requirements-dev.txt")


class TestTheFilesThemselves:
    def test_every_runtime_dependency_carries_a_floor(self):
        """An unpinned dependency resolves to whatever shipped that morning."""
        unbounded = [req.name for req in RUNTIME if not req.specifier]
        assert unbounded == []

    def test_every_dev_dependency_carries_a_floor(self):
        unbounded = [req.name for req in DEV if not req.specifier]
        assert unbounded == []

    def test_nothing_is_declared_in_both_files(self):
        """requirements-dev.txt includes the runtime file via `-r`.

        Naming a package in both means two floors to keep in step, and the
        looser one silently wins whenever pip resolves the pair.
        """
        overlap = {req.name for req in RUNTIME} & {req.name for req in DEV}
        assert overlap == set()
