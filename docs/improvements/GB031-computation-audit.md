# GB031 — Computation Correctness (M2), Pass 5

**Result: CLEAN PASS**
**Date:** 2026-10-06

## Methodology

M2 audits target computation issues: rounding errors, off-by-one mistakes,
integer overflow, floating-point precision loss, incorrect formula
implementations, and unit mismatches. Every line that touches money, dates,
or tax logic is read and cross-checked against the GST Act and Rules.

## Scope

Every computation-heavy module in the backend was reviewed:

| Module | Focus |
|---|---|
| `services/late_fee.py` | Late fee (s.47) and interest (s.50) on overdue returns |
| `services/itc.py` | ITC set-off waterfall (s.49/49A/49B), Rules 37/42/43 |
| `services/itc_deadline.py` | s.16(4) claim deadline, lapsing credit |
| `services/supplier_score.py` | Weighted scoring, confidence, provisioning |
| `services/gst_calendar.py` | IST offset, period arithmetic, FY boundaries |
| `services/filing.py` | GSTR-1/3B generation, rate allocation, B2CL threshold |
| `services/reconciliation.py` | Two-pass matching, credit note subtraction |
| `services/invoice_service.py` | SQL aggregation, Decimal conversion |
| `services/invoice_parser.py` | Input parsing, rate normalisation, money bounds |
| `services/gstr2b.py` | Portal JSON/CSV parsing, money bounds |
| `routers/dashboard.py` | Net liability, period history |
| `models/invoice.py` | `total_tax`, `invoice_value` derived properties |
| `models/mixins.py` | `Money` column type, `MONEY_MAX`, `ZERO` |

## Findings

None. The codebase is clean on every M2 dimension:

**Decimal discipline.** Every monetary value flows through `Numeric(16, 2)`
columns and `Decimal` arithmetic. No `float` touches money anywhere in the
computation path. SQL aggregates are converted via `Decimal(str(value))` to
avoid the float→Decimal binary approximation trap. The one use of `float` in
`supplier_score.py` (`statistics.pstdev`) operates on percentage-scale scores
that are rounded to integers, so the precision loss is immaterial.

**Rounding.** All rounding uses `ROUND_HALF_UP` to two decimal places via `_q()`
helpers. The late-fee split (`half = _q(total / 2)`, CGST gets `_q(total) - half`)
guarantees the two halves sum to the rounded total. The filing allocator
distributes residual paise to the largest share, preserving the sum.

**Boundary arithmetic.** Rule 37's lapse date is `invoice_date + timedelta(days=181)`,
correctly placing it on the day after the 180th. The s.16(4) claim deadline
correctly targets 30 November after the financial year end. Period arithmetic
uses `year * 12 + (month - 1)` to avoid month-rollover errors on the 60-month
Rule 43 lookback.

**Interest formula.** Daily simple interest:
`_q(net_tax * Decimal("0.18") * Decimal(days_late) / Decimal("365"))` — correct
per s.50, with every operand a Decimal.

**ITC waterfall.** The set-off order (IGST→IGST, IGST→CGST, IGST→SGST,
CGST→CGST, CGST→IGST, SGST→SGST, SGST→IGST, Cess→Cess) matches the statutory
sequence. Per-head rounding in `TaxHeads.scaled()` and per-head floor-at-zero in
net credit prevent negative heads.

**Overflow protection.** `MONEY_MAX = Decimal("99999999999999.99")` bounds every
ingested value before it reaches a column or a `quantize` call. The GSTR-2B
parser rejects records that exceed per-column or per-record magnitude limits.

**Rate snapping.** `_rate_of()` derives the rate from the figures and snaps to the
nearest valid GST slab (0, 0.1, 0.25, 1, 1.5, 3, 5, 6, 7.5, 12, 18, 28),
tolerating rounding noise in the source. `normalize_rate()` in the parser
correctly handles fraction-to-percentage conversion and sub-1% slabs.

**Dashboard net liability.** Per-head subtraction with floor at zero is an
intentional simplified view for the landing screen, clearly documented as
distinct from the statutory set-off in `itc.py`.

**Reconciliation tolerances.** `DEFAULT_TOLERANCE = Decimal("1.00")` and
`ARITHMETIC_TOLERANCE = Decimal("1.00")` are appropriate for portal-versus-books
matching where rounding on the portal side is outside the business's control.

## Notes

This is the fifth M2 pass. The computation layer has been hardened through
four prior rounds and remains clean. The consistent use of Decimal arithmetic,
ROUND_HALF_UP rounding, and careful boundary handling across all modules leaves
no actionable computation issues.
