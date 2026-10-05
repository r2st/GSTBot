# GB026 — State Machine Audit (M3, Pass 5 / C94 Pair 3)

**Date:** 2026-10-06
**Methodology:** M3 — State Machine Audit
**Pass:** 5
**Findings:** 2

---

## Audited Stateful Entities

| Entity | Enum | Verdict |
|---|---|---|
| Invoice | `InvoiceStatus` | **Fixed** — DUPLICATE status silently dropped by two paths |
| GSTRReturn | `ReturnStatus` | Clean (READY still unused; pinned by GB019) |
| Alert | `AlertStatus` | Clean |
| Subscription | `SubscriptionStatus` | Clean (fixed in GB019, webhook hardened in GB025) |
| ReconciliationRun | `ReconciliationStatus` | Clean (QUEUED pinned by GB019) |

---

## Finding 1: Reparsing a DUPLICATE invoice silently un-duplicates it

**Severity:** High
**File changed:** `app/routers/invoices.py`

### Problem

`POST /{id}/reparse` calls `process_invoice`, which blindly sets the invoice
to PROCESSING then PARSED. When the invoice was DUPLICATE — marked by
reconciliation because another row shares the same normalized counterparty
GSTIN and invoice number — the reparse dropped that verdict without checking
whether the duplicate condition still held.

The database unique constraint only catches *exact* key collisions, not the
normalized matches reconciliation uses (`normalize_invoice_number` strips
separators and leading zeros). So the reparse succeeded, the row returned to
PARSED, and the supply re-entered the filing pool. Until the next
reconciliation run, the same supply was counted twice in GSTR-1, the tax
summary, and the ITC position.

### Fix

`reparse_invoice` now refuses a DUPLICATE invoice with HTTP 409 and a message
directing the user to correct the invoice number or counterparty GSTIN, or to
delete one of the copies. Re-reading the file cannot change the identity that
made it a duplicate; only correcting that identity can.

---

## Finding 2: PATCHing a money field on a DUPLICATE invoice un-duplicates it

**Severity:** High
**File changed:** `app/routers/invoices.py`

### Problem

The PATCH handler's withdrawal logic treated DUPLICATE the same as
MATCHED, MISMATCHED, and MISSING_IN_2B: any correction to a reconciled field
(`taxable_value`, `cgst`, `sgst`, `igst`, `cess`, `invoice_date`,
`counterparty_gstin`, `invoice_number`) withdrew the verdict to PARSED.

But DUPLICATE is fundamentally different. The other three verdicts are about
the *figures* on the row — whether they match the portal's copy. DUPLICATE is
about the *identity*: the counterparty and the invoice number. Editing a money
field does not change who sent the invoice or what number it carries.

A user correcting the taxable amount on a duplicate invoice saw it silently
leave DUPLICATE and re-enter the filing pool. The dedup check only ran when
`invoice_number` or `counterparty_gstin` was among the changes, so a
money-only edit bypassed it entirely. Same consequence as F1: double-counted
supply until the next reconciliation.

### Fix

DUPLICATE status is now withdrawn only when `counterparty_gstin` or
`invoice_number` is among the corrections — the fields that actually
determine duplicate identity. Money, date, and other field edits leave it in
place.

---

## Tests added

| Test | Assertion |
|---|---|
| `test_reparse_on_a_duplicate_invoice_is_refused` | Reparse → 409 |
| `test_the_status_stays_duplicate` | Status unchanged after refused reparse |
| `test_patching_taxable_value_keeps_duplicate` | Money edit → still DUPLICATE |
| `test_patching_igst_keeps_duplicate` | Tax edit → still DUPLICATE |
| `test_patching_invoice_date_keeps_duplicate` | Date edit → still DUPLICATE |
| `test_patching_invoice_number_withdraws_duplicate` | Identity edit → PARSED |
| `test_patching_counterparty_gstin_withdraws_duplicate` | Identity edit → PARSED |

## Files changed

- `backend/app/routers/invoices.py`
- `backend/tests/test_duplicate_guard.py` (new)
