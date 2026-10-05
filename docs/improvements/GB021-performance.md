# GB021 — Performance (M8, Pass 4)

**Date**: 2026-10-06
**Methodology**: M8 — N+1 queries, sequential DB calls, missing indexes, redundant data loading, slow algorithms
**Result**: 2 findings, both fixed

---

## Findings

### 1. `/rule37` endpoint loads non-credit purchases it will discard

**File**: `routers/itc.py:110`, `services/itc.py:762`
**Category**: Redundant data loading

The `/api/v1/itc/rule37` endpoint called `purchase_invoices(db, business.id)` which loaded the entire purchase register — every invoice type, eligible or not — as ORM objects. `rule_37()` then iterated every row and skipped any where `claims_credit` was False (`itc_eligible=False` or `reverse_charge=True`).

For a business with a non-trivial purchase register, a significant fraction of rows are either blocked under s.17(5) or reverse-charge supplies. These were hydrated into ORM objects, touched once in the loop, and discarded. The `summarise()` function already narrowed this in SQL with `Invoice.itc_eligible.is_(True), Invoice.reverse_charge.is_(False)` — the router endpoint did not.

**Fix**: Added a `credit_only` keyword argument to `purchase_invoices()`. When True, the same SQL narrowing `summarise()` uses is applied, so non-credit rows never leave the database. The router now passes `credit_only=True`.

**Tests added** (`test_itc.py::TestCreditOnlyNarrowsInSQL`):
- `test_credit_only_excludes_non_eligible_purchases` — blocked and reverse-charge invoices are absent from the result
- `test_without_credit_only_returns_all` — the default behavior is unchanged
- `test_rule37_result_is_identical_with_narrowing` — Rule 37 reversal is byte-identical whether the narrowing is SQL-side or Python-side

### 2. Dead double-scan functions `_outward_tax` and `turnover_split`

**File**: `services/itc.py:806–881` (removed)
**Category**: Redundant data loading (stale code)

`_outward_tax_and_turnover` (line 819) was created to merge two separate full scans of the sales register — `_outward_tax` and `turnover_split` — into one. The merged function is the only one called in production (`summarise()` line 979). The two old functions:

- `_outward_tax` — called only from one index-plan test
- `turnover_split` — called nowhere

Both functions still compiled and appeared callable, so a future author could reintroduce the double-scan by calling the wrong one. The index test exercised the dead function's query plan rather than the production function's.

**Fix**: Removed both dead functions. Updated `test_filing_index.py` to verify the index plan for `_outward_tax_and_turnover` instead. Updated all tests that called the removed functions to call `_outward_tax_and_turnover` directly, with assertions against known-correct values rather than cross-checking against the deleted implementations.

**Tests updated**:
- `test_filing_index.py::test_the_output_tax_for_a_period_searches_on_the_direction` — now tests the production function
- `test_itc.py::test_turnover_split_treats_untaxed_sales_as_exempt` — uses `_outward_tax_and_turnover`
- `test_itc.py::test_output_tax_ignores_a_sale_whose_extraction_failed` — uses `_outward_tax_and_turnover`
- `test_itc.py::test_output_tax_keeps_each_head_on_its_own_head` — uses `_outward_tax_and_turnover`
- `test_itc.py::test_turnover_split_ignores_a_sale_whose_extraction_failed` — uses `_outward_tax_and_turnover`
- `test_itc.py::test_outward_tax_and_turnover_covers_all_dimensions` — replaces the cross-check test with direct assertions

---

## Codebase health

Pass 4 on a codebase that has been through three prior rounds of improvement. Every major service has extensive inline commentary explaining its performance decisions:

- `TenantSnapshot` pattern in `invoice_service.py` avoids ORM expiry in batch loops
- `tax_summaries()` batches multiple periods into one scan
- `alert_delivery.py` documents how it went from 3N to 3-per-chunk round trips
- `_outward_tax_and_turnover` merged two scans into one (now the only path)
- `purchases_outside_periods` narrows in SQL for the s.16(4) sweep
- Chunked IN clauses everywhere that loops over a growing list

The findings in this pass are at the margin — an endpoint that missed a narrowing the service layer already had, and dead code from a prior merge. The architecture is sound.
