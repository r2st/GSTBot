"""The mutation tester's own tests.

A mutation score is only worth acting on if the thing producing it is right
about two things: that it generates the bug it says it generated, and that it
generates no bug at all when it says it did not. Both failure modes are quiet.
A generator that silently skips a construct reports a perfect score for code
nobody tested, and one that mangles the module reports every mutant as killed
for the same reason a syntax error would.

So the operators are asserted individually, and the round-trip is asserted to
be a no-op.
"""
from __future__ import annotations

import ast
import subprocess
import sys
import textwrap

import pytest

from tools import mutation


def _sites(source: str) -> list[mutation.Mutation]:
    return mutation.mutations(textwrap.dedent(source))


def _apply_all(source: str) -> list[str]:
    """Every mutant of *source*, as unparsed text."""
    source = textwrap.dedent(source)
    return [mutation.apply(source, site.index)[0] for site in mutation.mutations(source)]


class TestWhatCountsAsAMutationSite:
    def test_a_comparison_yields_its_negation(self):
        sites = _sites("def f(a, b):\n    return a == b\n")
        assert [(s.operator, s.before, s.after) for s in sites] == [
            ("comparison", "==", "!=")
        ]

    def test_an_ordering_comparison_yields_both_negation_and_boundary(self):
        """`<` is wrong in two ways, and only one of them is an off-by-one."""
        sites = _sites("def f(a, b):\n    return a < b\n")
        assert [s.after for s in sites] == [">=", "<="]

    def test_arithmetic_swaps_the_operator(self):
        sites = _sites("def f(a, b):\n    return a + b\n")
        assert [(s.before, s.after) for s in sites] == [("+", "-")]

    def test_a_boolean_connective_is_swapped(self):
        sites = _sites("def f(a, b):\n    return a and b\n")
        assert [(s.operator, s.before, s.after) for s in sites] == [("logical", "and", "or")]

    def test_an_augmented_assignment_is_swapped(self):
        sites = _sites("def f(a):\n    a += 1\n    return a\n")
        augmented = [s for s in sites if s.operator == "augmented"]
        assert [(s.before, s.after) for s in augmented] == [("+=", "-=")]

    def test_an_integer_literal_is_shifted_by_one(self):
        sites = _sites("def f():\n    return 36\n")
        assert [(s.operator, s.before, s.after) for s in sites] == [("number", "36", "37")]

    def test_a_boolean_literal_is_flipped_rather_than_incremented(self):
        """`isinstance(True, int)` is true, so ordering here is load-bearing."""
        sites = _sites("def f():\n    return True\n")
        assert [(s.operator, s.before, s.after) for s in sites] == [
            ("boolean", "True", "False")
        ]

    def test_a_not_is_dropped(self):
        sites = _sites("def f(a):\n    return not a\n")
        assert [(s.operator, s.before, s.after) for s in sites] == [
            ("negation", "not x", "x")
        ]

    def test_a_site_records_the_line_it_came_from(self):
        sites = _sites("def f(a, b):\n    x = 1\n    return a == b\n")
        comparison = next(s for s in sites if s.operator == "comparison")
        assert comparison.lineno == 3


class TestWhatIsDeliberatelyLeftAlone:
    def test_strings_are_not_mutated(self):
        """An error message is prose, not behaviour worth asserting on."""
        assert _sites("def f():\n    return 'not found'\n") == []

    def test_floats_are_not_mutated(self):
        """In money code a shifted float is indistinguishable from rounding."""
        assert _sites("def f():\n    return 1.5\n") == []

    def test_a_docstring_is_not_mutated(self):
        assert _sites('def f():\n    """Doc."""\n    return None\n') == []

    def test_an_annotation_is_not_mutated(self):
        """Under `from __future__ import annotations` these never evaluate.

        A mutant no test could possibly kill is a permanent false survivor, and
        enough of them bury the real ones.
        """
        assert _sites("def f(a: int = 0) -> int:\n    return a\n") == [
            mutation.Mutation(index=0, lineno=1, operator="number", before="0", after="1")
        ]

    def test_an_annotated_assignment_keeps_its_value_mutable(self):
        sites = _sites("def f():\n    x: int = 7\n    return x\n")
        assert [(s.before, s.after) for s in sites] == [("7", "8")]

    def test_a_variable_annotation_alone_yields_nothing(self):
        assert _sites("class C:\n    x: dict[str, int]\n") == []

    # A maxsplit of 3 throughout, so that "the maxsplit was spared" is visible
    # in the sites themselves rather than colliding with the `1` in `[-1]`.
    @pytest.mark.parametrize(
        "expression,remaining",
        [
            ("s.rsplit('/', 3)[-1]", ("1", "2")),
            ("s.split('/', 3)[0]", ("0", "1")),
            ("s.rsplit('/', maxsplit=3)[-1]", ("1", "2")),
        ],
    )
    def test_a_maxsplit_that_cannot_change_the_piece_taken_is_left_alone(
        self, expression, remaining
    ):
        """The extra splits land on the side that is thrown away.

        `rsplit(sep, n)[-1]` is the same string for every n >= 1, so shifting
        the maxsplit is a mutant nothing can kill. Both `safe_filename` and
        `safe_extension` are written this way, and the two permanent survivors
        that produced were enough to make a clean run look like a finding.

        What is left is the subscript's own literal, which is a different bug
        and still worth making.
        """
        sites = _sites(f"def f(s):\n    return {expression}\n")
        assert [(s.before, s.after) for s in sites] == [remaining]

    def test_the_index_beside_a_spared_maxsplit_is_still_mutated(self):
        """Sparing the argument must not spare the subscript around it.

        `[-1]` where `[0]` was meant is a real bug in this exact idiom — it
        takes the extension instead of the stem — so it has to stay killable.
        """
        mutants = _apply_all("def f(s):\n    return s.rsplit('/', 3)[-1]\n")
        assert mutants == ["def f(s):\n    return s.rsplit('/', 3)[-2]"]

    def test_an_index_that_is_not_the_inert_one_leaves_the_maxsplit_alone_too(self):
        """`[-2]` moves with the maxsplit, so both literals are sites again."""
        sites = _sites("def f(s):\n    return s.rsplit('/', 2)[-2]\n")
        assert [(s.before, s.after) for s in sites] == [("2", "3"), ("2", "3")]

    def test_a_maxsplit_of_zero_is_mutated_because_it_really_does_matter(self):
        """`rsplit(sep, 0)` does not split, so 0 -> 1 changes the answer."""
        sites = _sites("def f(s):\n    return s.rsplit('/', 0)[-1]\n")
        assert [(s.before, s.after) for s in sites] == [("0", "1"), ("1", "2")]

    def test_a_maxsplit_is_only_spared_for_the_index_that_makes_it_inert(self):
        """`rsplit(sep, n)[0]` is the leading piece, which n very much moves."""
        sites = _sites("def f(s):\n    return s.rsplit('/', 1)[0]\n")
        assert [(s.before, s.after) for s in sites] == [("1", "2"), ("0", "1")]

    def test_a_computed_maxsplit_is_not_reasoned_about(self):
        """Nothing here can tell whether `n` is ever 0, so nothing is spared."""
        sites = _sites("def f(s, n):\n    return s.rsplit('/', n)[-1]\n")
        assert [(s.before, s.after) for s in sites] == [("1", "2")]

    def test_an_unrelated_split_keeps_every_site_it_had(self):
        """The exclusion is narrow: no maxsplit means nothing to spare."""
        sites = _sites("def f(s):\n    return s.split('/')[1]\n")
        assert [(s.before, s.after) for s in sites] == [("1", "2")]


class TestApplyingAMutation:
    def test_applying_produces_exactly_the_described_change(self):
        source = "def f(a, b):\n    return a == b\n"
        mutated, applied = mutation.apply(source, 0)
        assert applied.after == "!="
        assert "a != b" in mutated

    def test_each_index_changes_one_thing_and_no_other(self):
        """Sites are numbered depth-first, so an operand precedes its operator."""
        source = "def f(a, b, c):\n    return a == b and b == c\n"
        mutants = _apply_all(source)
        assert "a != b and b == c" in mutants[0]
        assert "a == b and b != c" in mutants[1]
        assert "a == b or b == c" in mutants[2]

    def test_every_mutant_of_a_real_module_still_parses(self):
        """A mutant that will not compile is killed for the wrong reason."""
        source = (mutation.BACKEND / "app/services/gstin.py").read_text()
        for site in mutation.mutations(source):
            mutated, _ = mutation.apply(source, site.index)
            ast.parse(mutated)  # raises SyntaxError if the transform is broken

    def test_every_mutant_differs_from_the_baseline(self):
        """A mutant identical to its baseline would survive by construction."""
        source = (mutation.BACKEND / "app/core/ratespec.py").read_text()
        baseline = mutation.normalize(source)
        for site in mutation.mutations(source):
            mutated, _ = mutation.apply(source, site.index)
            assert mutated != baseline, site.describe()

    def test_an_unknown_index_is_an_error_rather_than_a_silent_no_op(self):
        with pytest.raises(IndexError):
            mutation.apply("def f():\n    return 1\n", 999)

    def test_indices_are_stable_across_calls(self):
        source = (mutation.BACKEND / "app/core/sanitize.py").read_text()
        first = mutation.mutations(source)
        second = mutation.mutations(source)
        assert first == second


class TestGettingTheMutantActuallyLoaded:
    """Writing the file is not the same as the next run seeing it."""

    def test_a_same_length_rewrite_is_not_served_from_stale_bytecode(self, tmp_path):
        """The false-survivor bug, reproduced at the level it happens.

        CPython validates a cached `.pyc` against the source's mtime *and*
        size, and stores that mtime with one-second resolution. A mutant is a
        one-character edit, so the size matches; the runner rewrites the same
        path within milliseconds, so the second usually matches too. The
        interpreter then imports the previous bytecode, the mutation never runs,
        the tests pass, and the mutant is reported SURVIVED — intermittently,
        and in the direction that invents a hole in the suite.

        Asserted end to end through a real subprocess import, because the whole
        bug lives in the interpreter's cache validation rather than in
        anything this module can be asked directly.
        """
        (tmp_path / "m.py").write_text("def f(a, b):\n    return a + b\n")

        def value_seen() -> str:
            result = subprocess.run(
                [sys.executable, "-c", "import m; print(m.f(3, 4))"],
                cwd=tmp_path,
                capture_output=True,
                text=True,
                check=True,
            )
            return result.stdout.strip()

        # Populates __pycache__, which is the precondition for the bug.
        assert value_seen() == "7"

        mutation._write_module(tmp_path, "m.py", "def f(a, b):\n    return a - b\n")
        assert value_seen() == "-1"

    def test_the_helper_leaves_the_source_it_was_given(self, tmp_path):
        mutation._write_module(tmp_path, "m.py", "x = 1\n")
        assert (tmp_path / "m.py").read_text() == "x = 1\n"

    def test_writing_a_module_that_was_never_imported_is_not_an_error(self, tmp_path):
        """There is no cache entry to drop on the first write into a workspace."""
        mutation._write_module(tmp_path, "fresh.py", "x = 1\n")
        assert (tmp_path / "fresh.py").is_file()


class TestTheRoundTrip:
    def test_normalizing_leaves_behaviour_alone(self):
        source = "def f(a):\n    return a * 2\n"
        namespace: dict = {}
        exec(mutation.normalize(source), namespace)  # noqa: S102 - the point of the test
        assert namespace["f"](21) == 42

    def test_normalizing_is_idempotent(self):
        source = (mutation.BACKEND / "app/services/gstin.py").read_text()
        once = mutation.normalize(source)
        assert mutation.normalize(once) == once

    def test_normalizing_preserves_the_module_docstring(self):
        source = '"""Top."""\n\n\ndef f():\n    return 1\n'
        assert ast.get_docstring(ast.parse(mutation.normalize(source))) == "Top."


class TestTargets:
    def test_every_target_names_a_module_that_exists(self):
        for target in mutation.TARGETS:
            assert (mutation.BACKEND / target.module).is_file(), target.name

    def test_every_target_names_test_files_that_exist(self):
        for target in mutation.TARGETS:
            for test_file in target.tests:
                assert (mutation.BACKEND / test_file).is_file(), target.name

    def test_every_target_has_at_least_one_mutation_site(self):
        """A target with no sites would report a perfect score for free."""
        for target in mutation.TARGETS:
            source = (mutation.BACKEND / target.module).read_text()
            assert mutation.mutations(source), target.name

    def test_target_names_are_unique(self):
        names = [target.name for target in mutation.TARGETS]
        assert len(names) == len(set(names))


class TestScoring:
    def _result(self, status: str) -> mutation.MutantResult:
        return mutation.MutantResult(
            index=0, lineno=1, operator="comparison", before="==", after="!=", status=status
        )

    def test_a_timeout_counts_as_killed(self):
        """A mutant that hangs the suite has been detected, not missed."""
        assert self._result(mutation.TIMEOUT).killed

    def test_a_survivor_does_not_count_as_killed(self):
        assert not self._result(mutation.SURVIVED).killed

    def test_the_score_is_the_killed_fraction(self):
        report = mutation.Report(target="t", module="m.py", tests=["t.py"])
        report.results = [
            self._result(mutation.KILLED),
            self._result(mutation.KILLED),
            self._result(mutation.SURVIVED),
            self._result(mutation.TIMEOUT),
        ]
        assert report.score == 0.75
        assert len(report.survivors) == 1

    def test_an_empty_report_does_not_divide_by_zero(self):
        assert mutation.Report(target="t", module="m.py", tests=[]).score == 1.0


class TestTheCommandLine:
    def test_a_named_target_is_selected(self):
        args = mutation._parse_args(["--target", "gstin"])
        assert [t.name for t in mutation._selected(args)] == ["gstin"]

    def test_all_selects_every_target(self):
        args = mutation._parse_args(["--all"])
        assert len(mutation._selected(args)) == len(mutation.TARGETS)

    def test_an_ad_hoc_module_needs_tests(self):
        args = mutation._parse_args(["--module", "app/core/sanitize.py"])
        with pytest.raises(SystemExit):
            mutation._selected(args)

    def test_selecting_nothing_is_an_error_rather_than_a_silent_pass(self):
        with pytest.raises(SystemExit):
            mutation._selected(mutation._parse_args([]))
