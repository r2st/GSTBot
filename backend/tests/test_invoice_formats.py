"""A corpus of whole invoices, each in a layout a real supplier prints.

Every other extraction test in this suite aims one assertion at one pattern:
:mod:`tests.test_invoice_parser` has a class per past bug, and each feeds
``parse_heuristic`` the one line the bug lived on. That is the right shape for
a regression test and it leaves a gap, because the patterns in
``invoice_parser`` do not run one at a time. They run over a whole page, in
each other's way — the total pattern reads a line the tax patterns have
already been down, the loose date label sees every date the document prints,
and the invoice-number pattern sees every word that contains "invoice".

The gap is not hypothetical. Up to this file, the only *complete* document the
suite parsed was ``INTRASTATE_INVOICE`` — one layout, with colons after every
label, "Grand Total" as the total's wording, slash-separated dates, and each
tax head on its own line. Every label pattern here was therefore proven
against exactly one way of printing it, and a supplier who writes "Sub-Total"
instead of "Taxable Value", or lays the heads out in columns, or dates the
invoice "15-Sep-2024", was relying on regexes nothing had ever run over their
page.

So each case below is a document rather than a line, stated the way some real
class of supplier prints it, with the full field set asserted at once. What
that buys over the per-pattern tests is interaction: a layout where the total
pattern and the taxable pattern both match the same line, or where the
document prints three dates and only one of them is the invoice date, fails
here and passes every test written a pattern at a time.

The expectations are deliberately whole-record. A corpus that asserted only
the field it was added for would let a layout quietly lose its date while
proving its total still reads.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

import pytest

from app.services.invoice_parser import parse_heuristic
from tests.conftest import BUSINESS_GSTIN, SUPPLIER_GSTIN_OTHER_STATE, SUPPLIER_GSTIN_SAME_STATE

# An unread money field is this zero rather than ``None`` — see
# :func:`app.services.invoice_parser.parse_heuristic`. Spelled out here because
# "the head was not found" is an expectation several layouts below make.
ZERO = Decimal("0.00")


@dataclass(frozen=True)
class Layout:
    """One supplier's way of printing an invoice, and what it should yield."""

    name: str
    text: str
    invoice_number: str | None = None
    invoice_date: date | None = None
    taxable_value: Decimal = ZERO
    total_value: Decimal = ZERO
    cgst: Decimal = ZERO
    sgst: Decimal = ZERO
    igst: Decimal = ZERO
    cess: Decimal = ZERO
    tax_rate: Decimal | None = None
    hsn_code: str | None = None
    reverse_charge: bool = False
    supplier_gstin: str | None = None
    buyer_gstin: str | None = None
    # Fields this layout deliberately does not carry, so that "not found" is
    # asserted as a decision rather than passing by omission.
    absent: tuple[str, ...] = field(default=())


def money(value: str) -> Decimal:
    return Decimal(value)


CORPUS: tuple[Layout, ...] = (
    # ---------------------------------------------------------------- basics
    Layout(
        name="colon-labelled intra-state, one head per line",
        text=f"""\
MUMBAI HARDWARE SUPPLIES
GSTIN: {SUPPLIER_GSTIN_SAME_STATE}
TAX INVOICE
Invoice No: MH/2026/118
Invoice Date: 02/05/2026
Bill To: UMANG TRADERS  GSTIN: {BUSINESS_GSTIN}
HSN: 73181500
Taxable Value: 100000.00
CGST @ 9%: 9000.00
SGST @ 9%: 9000.00
Grand Total: 118000.00
""",
        invoice_number="MH/2026/118",
        invoice_date=date(2026, 5, 2),
        taxable_value=money("100000.00"),
        total_value=money("118000.00"),
        cgst=money("9000.00"),
        sgst=money("9000.00"),
        tax_rate=Decimal("18"),
        hsn_code="73181500",
        supplier_gstin=SUPPLIER_GSTIN_SAME_STATE,
        buyer_gstin=BUSINESS_GSTIN,
    ),
    Layout(
        name="inter-state, IGST, dotted date, 'Total Invoice Value'",
        text=f"""\
BENGALURU COMPONENTS LLP
GSTIN {SUPPLIER_GSTIN_OTHER_STATE}
Tax Invoice
Invoice No. GST/24-25/0087
Invoice Date : 03.04.2026
Buyer GSTIN {BUSINESS_GSTIN}
HSN/SAC: 8471
Taxable Amount   100000.00
IGST @ 18%       18000.00
Total Invoice Value 118000.00
""",
        invoice_number="GST/24-25/0087",
        invoice_date=date(2026, 4, 3),
        taxable_value=money("100000.00"),
        total_value=money("118000.00"),
        igst=money("18000.00"),
        tax_rate=Decimal("18"),
        hsn_code="8471",
        supplier_gstin=SUPPLIER_GSTIN_OTHER_STATE,
        buyer_gstin=BUSINESS_GSTIN,
    ),
    # ------------------------------------------------------------- wordings
    Layout(
        name="'Sub-Total' for taxable value and 'Amount Payable' for the total",
        text=f"""\
DECCAN STATIONERS
GSTIN: {SUPPLIER_GSTIN_SAME_STATE}
Bill No: BL-77
Bill Date: 05/05/2026
Sub-Total: 200000.00
CGST 9% 18000.00  SGST 9% 18000.00
Amount Payable: 236000.00
""",
        invoice_number="BL-77",
        invoice_date=date(2026, 5, 5),
        taxable_value=money("200000.00"),
        total_value=money("236000.00"),
        cgst=money("18000.00"),
        sgst=money("18000.00"),
        tax_rate=Decimal("18"),
        supplier_gstin=SUPPLIER_GSTIN_SAME_STATE,
    ),
    Layout(
        name="'Net Amount' and 'Invoice Total', hash-marked number",
        text=f"""\
PUNE FABRICATORS
GSTIN: {SUPPLIER_GSTIN_SAME_STATE}
Invoice #PF-2026-0042
Date of Invoice: 18/06/2026
Net Amount 50000.00
CGST @ 6% 3000.00
SGST @ 6% 3000.00
Invoice Total 56000.00
""",
        invoice_number="PF-2026-0042",
        invoice_date=date(2026, 6, 18),
        taxable_value=money("50000.00"),
        total_value=money("56000.00"),
        cgst=money("3000.00"),
        sgst=money("3000.00"),
        tax_rate=Decimal("12"),
        supplier_gstin=SUPPLIER_GSTIN_SAME_STATE,
    ),
    # ------------------------------------------------------------ tabular
    Layout(
        name="column layout, no colons, amounts right-aligned",
        text=f"""\
NASHIK AGRO PRODUCTS
GSTIN {SUPPLIER_GSTIN_SAME_STATE}
TAX INVOICE
Invoice No                       NA-9912
Invoice Date                     30/11/2026
Description        Qty  Rate     Amount
Drip line 16mm      10  1000.00  10,000.00
Taxable Value                    10,000.00
CGST 9%                          900.00
SGST 9%                          900.00
Grand Total                      11,800.00
""",
        invoice_number="NA-9912",
        invoice_date=date(2026, 11, 30),
        taxable_value=money("10000.00"),
        total_value=money("11800.00"),
        cgst=money("900.00"),
        sgst=money("900.00"),
        tax_rate=Decimal("18"),
        supplier_gstin=SUPPLIER_GSTIN_SAME_STATE,
    ),
    Layout(
        name="amount printed before its head's label",
        text=f"""\
KOLHAPUR CASTINGS
GSTIN: {SUPPLIER_GSTIN_SAME_STATE}
Invoice No: A-1
Invoice Date: 01/07/2026
Taxable Value: 5,000.00
900.00 CGST
900.00 SGST
Grand Total: 6,800.00
""",
        invoice_number="A-1",
        invoice_date=date(2026, 7, 1),
        taxable_value=money("5000.00"),
        total_value=money("6800.00"),
        cgst=money("900.00"),
        sgst=money("900.00"),
        # No percent is printed anywhere, so there is no rate to read. Empty
        # rather than inferred from the figures: `validate_period` would rather
        # report that nothing was declared than check against a guess.
        absent=("tax_rate",),
        supplier_gstin=SUPPLIER_GSTIN_SAME_STATE,
    ),
    # --------------------------------------------------------------- dates
    Layout(
        name="month spelled out in full",
        text=f"""\
SATARA ENGINEERING
GSTIN: {SUPPLIER_GSTIN_SAME_STATE}
Invoice No: SE-4
Invoice Date: 15 September 2026
Taxable Value: 1,000.00
CGST @ 9% 90.00
SGST @ 9% 90.00
Grand Total: 1,180.00
""",
        invoice_number="SE-4",
        invoice_date=date(2026, 9, 15),
        taxable_value=money("1000.00"),
        total_value=money("1180.00"),
        cgst=money("90.00"),
        sgst=money("90.00"),
        tax_rate=Decimal("18"),
        supplier_gstin=SUPPLIER_GSTIN_SAME_STATE,
    ),
    Layout(
        name="abbreviated month, and a due date printed above the invoice date",
        text=f"""\
THANE POLYMERS
GSTIN: {SUPPLIER_GSTIN_SAME_STATE}
Due Date: 15-Oct-2026
Invoice No: TP-55
Invoice Date: 15-Sep-2026
Taxable Value: 1,000.00
IGST @ 18% 180.00
Grand Total: 1,180.00
""",
        invoice_number="TP-55",
        # The due date is printed first and a bare "date" label would match it.
        # Filing under the month an invoice must be *paid* in puts it one
        # period late, in a return already filed by the time anyone reconciles.
        invoice_date=date(2026, 9, 15),
        taxable_value=money("1000.00"),
        total_value=money("1180.00"),
        igst=money("180.00"),
        tax_rate=Decimal("18"),
        supplier_gstin=SUPPLIER_GSTIN_SAME_STATE,
    ),
    Layout(
        name="month-first date, which only one reading can be",
        text=f"""\
NAGPUR IMPORTS
GSTIN: {SUPPLIER_GSTIN_SAME_STATE}
Invoice No: NI-17
Invoice Date: 12/31/2026
Taxable Value: 1,000.00
Grand Total: 1,000.00
""",
        invoice_number="NI-17",
        invoice_date=date(2026, 12, 31),
        taxable_value=money("1000.00"),
        total_value=money("1000.00"),
        supplier_gstin=SUPPLIER_GSTIN_SAME_STATE,
    ),
    # ------------------------------------------------------------ currency
    Layout(
        name="rupee symbol and 'Rs.' before the figures",
        text=f"""\
AURANGABAD TOOLS
GSTIN: {SUPPLIER_GSTIN_SAME_STATE}
Invoice No: AT-12
Invoice Date: 01/09/2026
Taxable Value: ₹1,00,000.00
CGST @ 9% 9,000.00
SGST @ 9% 9,000.00
Grand Total: Rs. 1,18,000.00
""",
        invoice_number="AT-12",
        invoice_date=date(2026, 9, 1),
        taxable_value=money("100000.00"),
        total_value=money("118000.00"),
        cgst=money("9000.00"),
        sgst=money("9000.00"),
        tax_rate=Decimal("18"),
        supplier_gstin=SUPPLIER_GSTIN_SAME_STATE,
    ),
    # ---------------------------------------------------------------- slabs
    Layout(
        name="cess alongside the 28% slab",
        text=f"""\
SOLAPUR BEVERAGES
GSTIN: {SUPPLIER_GSTIN_SAME_STATE}
Invoice No: SB-14
Invoice Date: 02/09/2026
Taxable Value: 1,00,000.00
CGST @ 14% 14,000.00
SGST @ 14% 14,000.00
CESS @ 12% 12,000.00
Grand Total: 1,40,000.00
""",
        invoice_number="SB-14",
        invoice_date=date(2026, 9, 2),
        taxable_value=money("100000.00"),
        total_value=money("140000.00"),
        cgst=money("14000.00"),
        sgst=money("14000.00"),
        cess=money("12000.00"),
        tax_rate=Decimal("28"),
        supplier_gstin=SUPPLIER_GSTIN_SAME_STATE,
    ),
    Layout(
        name="merchant-export 0.1%, printed as two halves of 0.05%",
        text=f"""\
JALGAON EXPORTS
GSTIN: {SUPPLIER_GSTIN_SAME_STATE}
Invoice No: JE-10
Invoice Date: 01/09/2026
Taxable Value: 10,00,000.00
CGST @ 0.05% 500.00
SGST @ 0.05% 500.00
Grand Total: 10,01,000.00
""",
        invoice_number="JE-10",
        invoice_date=date(2026, 9, 1),
        taxable_value=money("1000000.00"),
        total_value=money("1001000.00"),
        cgst=money("500.00"),
        sgst=money("500.00"),
        # The slab the two halves add up to, not either half.
        tax_rate=Decimal("0.1"),
        supplier_gstin=SUPPLIER_GSTIN_SAME_STATE,
    ),
    Layout(
        name="affordable-housing 1.5%, printed as two halves of 0.75%",
        text=f"""\
RAIGAD DEVELOPERS
GSTIN: {SUPPLIER_GSTIN_SAME_STATE}
Invoice No: RD-11
Invoice Date: 01/09/2026
Taxable Value: 10,00,000.00
CGST @ 0.75% 7,500.00
SGST @ 0.75% 7,500.00
Grand Total: 10,15,000.00
""",
        invoice_number="RD-11",
        invoice_date=date(2026, 9, 1),
        taxable_value=money("1000000.00"),
        total_value=money("1015000.00"),
        cgst=money("7500.00"),
        sgst=money("7500.00"),
        tax_rate=Decimal("1.5"),
        supplier_gstin=SUPPLIER_GSTIN_SAME_STATE,
    ),
    # -------------------------------------------------------- reverse charge
    Layout(
        name="rule 46(p) answered 'No' after the word Applicable",
        text=f"""\
LATUR LOGISTICS
GSTIN: {SUPPLIER_GSTIN_SAME_STATE}
Invoice No: LL-6
Invoice Date: 09/09/2026
Whether Reverse Charge Applicable: No
Taxable Value: 1,000.00
CGST @ 9% 90.00
SGST @ 9% 90.00
Grand Total: 1,180.00
""",
        invoice_number="LL-6",
        invoice_date=date(2026, 9, 9),
        taxable_value=money("1000.00"),
        total_value=money("1180.00"),
        cgst=money("90.00"),
        sgst=money("90.00"),
        tax_rate=Decimal("18"),
        reverse_charge=False,
        supplier_gstin=SUPPLIER_GSTIN_SAME_STATE,
    ),
    Layout(
        name="rule 46(p) answered as 'RCM' on a pre-printed form",
        text=f"""\
NANDED GOODS CARRIERS
GSTIN: {SUPPLIER_GSTIN_SAME_STATE}
Invoice No: NGC-11
Invoice Date: 11/09/2026
Whether tax is payable under RCM (Y/N): Y
Taxable Value: 2,000.00
Grand Total: 2,000.00
""",
        invoice_number="NGC-11",
        invoice_date=date(2026, 9, 11),
        taxable_value=money("2000.00"),
        total_value=money("2000.00"),
        # A goods transport agency's invoice carries no tax because the
        # recipient pays it. Read as an ordinary invoice it is marked
        # creditable, and the business claims credit for tax it never paid.
        reverse_charge=True,
        supplier_gstin=SUPPLIER_GSTIN_SAME_STATE,
    ),
    Layout(
        name="rule 46(p) glossing the phrase with the acronym",
        text=f"""\
PARBHANI ADVOCATES
GSTIN: {SUPPLIER_GSTIN_SAME_STATE}
Invoice No: PA-4
Invoice Date: 12/09/2026
Whether GST is payable under reverse charge (RCM): Yes
Taxable Value: 25,000.00
Grand Total: 25,000.00
""",
        invoice_number="PA-4",
        invoice_date=date(2026, 9, 12),
        taxable_value=money("25000.00"),
        total_value=money("25000.00"),
        reverse_charge=True,
        supplier_gstin=SUPPLIER_GSTIN_SAME_STATE,
    ),
    Layout(
        name="a supplier whose trade name contains the acronym",
        text=f"""\
RCM STEEL TRADERS
GSTIN: {SUPPLIER_GSTIN_SAME_STATE}
Invoice No: RST-2
Invoice Date: 13/09/2026
Taxable Value: 1,000.00
CGST @ 9% 90.00
SGST @ 9% 90.00
Grand Total: 1,180.00
""",
        invoice_number="RST-2",
        invoice_date=date(2026, 9, 13),
        taxable_value=money("1000.00"),
        total_value=money("1180.00"),
        cgst=money("90.00"),
        sgst=money("90.00"),
        tax_rate=Decimal("18"),
        # The letters are the supplier's name, not an answer, and the invoice
        # charges tax in the ordinary way.
        reverse_charge=False,
        supplier_gstin=SUPPLIER_GSTIN_SAME_STATE,
    ),
    Layout(
        name="rule 46(p) answered 'Y' in a (Y/N) box",
        text=f"""\
AKOLA TRANSPORT
GSTIN: {SUPPLIER_GSTIN_SAME_STATE}
Invoice No: AT-7
Invoice Date: 09/09/2026
Reverse Charge (Y/N): Y
Taxable Value: 1,000.00
Grand Total: 1,000.00
""",
        invoice_number="AT-7",
        invoice_date=date(2026, 9, 9),
        taxable_value=money("1000.00"),
        total_value=money("1000.00"),
        reverse_charge=True,
        supplier_gstin=SUPPLIER_GSTIN_SAME_STATE,
    ),
    # ----------------------------------------------------- page furniture
    Layout(
        name="a rule 46 footer naming a head it carries no tax for",
        text=f"""\
CHANDRAPUR MINERALS
GSTIN: {SUPPLIER_GSTIN_SAME_STATE}
Invoice No: CM-8
Invoice Date: 22/09/2026
Taxable Value: 1,00,000.00
CGST @ 9% 9,000.00
SGST @ 9% 9,000.00
IGST is not applicable on intra-state supply as per Section 8
Grand Total: 1,18,000.00
Page 1 of 2 - CGST/SGST summary continued on 22/09/2026
""",
        invoice_number="CM-8",
        invoice_date=date(2026, 9, 22),
        taxable_value=money("100000.00"),
        total_value=money("118000.00"),
        cgst=money("9000.00"),
        sgst=money("9000.00"),
        tax_rate=Decimal("18"),
        # The footer names IGST and carries a section number. Read as a tax
        # line it puts ₹8 of IGST on an intra-state invoice — and because the
        # first reading of a head wins, a real IGST line below it would then be
        # discarded in favour of the section number.
        absent=("igst",),
        supplier_gstin=SUPPLIER_GSTIN_SAME_STATE,
    ),
    Layout(
        name="a dotted date in a footer, below the real IGST line",
        text=f"""\
WARDHA CHEMICALS
GSTIN: {SUPPLIER_GSTIN_OTHER_STATE}
Invoice No: WC-18
Invoice Date: 22/09/2026
Taxable Value: 4,50,000.00
IGST @ 18% 81,000.00
IGST is not applicable as per Section 8 dated 22.09.2026
Grand Total: 5,31,000.00
""",
        invoice_number="WC-18",
        invoice_date=date(2026, 9, 22),
        taxable_value=money("450000.00"),
        total_value=money("531000.00"),
        # ₹22.09 read off the footer's date would not merely be wrong, it would
        # be *first*, so the real ₹81,000 two lines up is what gets discarded.
        igst=money("81000.00"),
        tax_rate=Decimal("18"),
        supplier_gstin=SUPPLIER_GSTIN_OTHER_STATE,
    ),
    Layout(
        name="an e-invoice IRN block above the invoice number",
        text=f"""\
GONDIA PACKAGING
GSTIN: {SUPPLIER_GSTIN_SAME_STATE}
Tax Invoice
IRN: a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2
Ack No: 112410000123456
Invoice No: EI-900
Invoice Date: 07/07/2026
Taxable Value: 1,000.00
Grand Total: 1,000.00
""",
        # The IRN is 64 hex characters directly under the words "Tax Invoice".
        # A number pattern that reaches past its own label finds it there.
        invoice_number="EI-900",
        invoice_date=date(2026, 7, 7),
        taxable_value=money("1000.00"),
        total_value=money("1000.00"),
        supplier_gstin=SUPPLIER_GSTIN_SAME_STATE,
    ),
    Layout(
        name="an invoice citing the earlier one it continues from",
        text=f"""\
JALNA ENGINEERING WORKS
GSTIN: {SUPPLIER_GSTIN_SAME_STATE}
Tax Invoice
Against our Invoice No: JEW/2025/077 dated 04/04/2025
Invoice No: JEW/2026/214
Invoice Date: 10/10/2026
Taxable Value: 50,000.00
CGST @ 9% 4,500.00
SGST @ 9% 4,500.00
Grand Total: 59,000.00
""",
        # The cited number belongs to a real earlier document, so storing it
        # matches this supply to that invoice's GSTR-2B row and files two
        # supplies under one `inum`. Nothing downstream looks twice at it.
        invoice_number="JEW/2026/214",
        invoice_date=date(2026, 10, 10),
        taxable_value=money("50000.00"),
        total_value=money("59000.00"),
        cgst=money("4500.00"),
        sgst=money("4500.00"),
        tax_rate=Decimal("18"),
        supplier_gstin=SUPPLIER_GSTIN_SAME_STATE,
    ),
    Layout(
        name="the triplicate marking printed beside the number",
        text=f"""\
HINGOLI PAPER MILLS
GSTIN: {SUPPLIER_GSTIN_SAME_STATE}
ORIGINAL FOR RECIPIENT    Invoice No: HPM-31
Invoice Date: 11/10/2026
Taxable Value: 10,000.00
CGST @ 9% 900.00
SGST @ 9% 900.00
Grand Total: 11,800.00
""",
        # "ORIGINAL" here marks the copy, not an earlier invoice. Treated as a
        # citation it takes the number off every document printed this way.
        invoice_number="HPM-31",
        invoice_date=date(2026, 10, 11),
        taxable_value=money("10000.00"),
        total_value=money("11800.00"),
        cgst=money("900.00"),
        sgst=money("900.00"),
        tax_rate=Decimal("18"),
        supplier_gstin=SUPPLIER_GSTIN_SAME_STATE,
    ),
    Layout(
        name="a total written out in words below the figure",
        text=f"""\
BEED TEXTILES
GSTIN: {SUPPLIER_GSTIN_SAME_STATE}
Invoice No: BT-20
Invoice Date: 08/08/2026
Taxable Value: 1,00,000.00
CGST @ 9% 9,000.00
SGST @ 9% 9,000.00
Grand Total: 1,18,000.00
Amount in words: Rupees One Lakh Eighteen Thousand Only
""",
        invoice_number="BT-20",
        invoice_date=date(2026, 8, 8),
        taxable_value=money("100000.00"),
        total_value=money("118000.00"),
        cgst=money("9000.00"),
        sgst=money("9000.00"),
        tax_rate=Decimal("18"),
        supplier_gstin=SUPPLIER_GSTIN_SAME_STATE,
    ),
    # ------------------------------------------------- combined tax figure
    Layout(
        name="CGST and SGST combined into one figure",
        text=f"""\
DHULE MACHINE WORKS
GSTIN: {SUPPLIER_GSTIN_SAME_STATE}
Invoice No: DM-3
Invoice Date: 12/08/2026
Taxable Value: 1,00,000.00
Total Tax (CGST + SGST): 18,000.00
Grand Total: 1,18,000.00
""",
        invoice_number="DM-3",
        invoice_date=date(2026, 8, 12),
        taxable_value=money("100000.00"),
        total_value=money("118000.00"),
        # One figure, two heads. Split it and the tax on the invoice doubles;
        # halve it and the split is a guess. Left unread, `validate` reports
        # that taxable value plus tax does not foot to the total, which is a
        # blank a reviewer can act on.
        absent=("cgst", "sgst"),
        supplier_gstin=SUPPLIER_GSTIN_SAME_STATE,
    ),
)


def ids() -> list[str]:
    return [layout.name for layout in CORPUS]


@pytest.mark.parametrize("layout", CORPUS, ids=ids())
class TestEveryLayoutInTheCorpus:
    """Each field asserted separately, so a failure names the field and layout."""

    def test_the_invoice_number_is_read(self, layout: Layout):
        assert parse_heuristic(layout.text).invoice_number == layout.invoice_number

    def test_the_invoice_date_is_read(self, layout: Layout):
        # The one field that decides which return the invoice appears in. Read
        # a month out it files in the neighbouring period; not read at all it
        # leaves the register, the dashboard and the GSTR-1 together.
        assert parse_heuristic(layout.text).invoice_date == layout.invoice_date

    def test_the_supplier_gstin_is_read(self, layout: Layout):
        assert parse_heuristic(layout.text).supplier_gstin == layout.supplier_gstin

    def test_the_buyer_gstin_is_read(self, layout: Layout):
        assert parse_heuristic(layout.text).buyer_gstin == layout.buyer_gstin

    def test_the_taxable_value_is_read(self, layout: Layout):
        assert parse_heuristic(layout.text).taxable_value == layout.taxable_value

    def test_the_total_is_read(self, layout: Layout):
        assert parse_heuristic(layout.text).total_value == layout.total_value

    @pytest.mark.parametrize("head", ["cgst", "sgst", "igst", "cess"])
    def test_each_tax_head_is_read(self, layout: Layout, head: str):
        assert getattr(parse_heuristic(layout.text), head) == getattr(layout, head)

    def test_the_rate_is_read(self, layout: Layout):
        assert parse_heuristic(layout.text).tax_rate == layout.tax_rate

    def test_the_hsn_code_is_read(self, layout: Layout):
        assert parse_heuristic(layout.text).hsn_code == layout.hsn_code

    def test_the_reverse_charge_answer_is_read(self, layout: Layout):
        assert parse_heuristic(layout.text).reverse_charge is layout.reverse_charge

    def test_the_fields_this_layout_does_not_carry_stay_empty(self, layout: Layout):
        # Named in `absent` rather than left to the default, so that a layout
        # whose whole point is that something must *not* be read says so.
        parsed = parse_heuristic(layout.text)
        for name in layout.absent:
            value = getattr(parsed, name)
            assert value in (None, ZERO), f"{name} should not have been read, got {value}"


class TestTheCorpusItself:
    """The corpus is only worth what it actually varies."""

    def test_no_two_layouts_are_the_same_document(self):
        texts = [layout.text for layout in CORPUS]
        assert len(set(texts)) == len(texts)

    def test_every_layout_states_a_total_or_says_why_not(self):
        # A layout with nothing in it would pass every assertion above.
        for layout in CORPUS:
            assert layout.total_value > ZERO, layout.name

    def test_the_corpus_covers_both_supply_types(self):
        # An intra-state document splits into CGST and SGST and an inter-state
        # one carries IGST; a corpus of only one shape proves half the module.
        assert any(layout.igst > ZERO for layout in CORPUS)
        assert any(layout.cgst > ZERO for layout in CORPUS)
