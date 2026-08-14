import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import ValidationIssues from "./ValidationIssues";

function issue(overrides = {}) {
  return {
    invoice_id: 42,
    invoice_number: "INV-2026-0042",
    field: "counterparty_gstin",
    severity: "error",
    message: "A GSTIN is 15 characters.",
    ...overrides,
  };
}

function renderIssues(issues, label = "Validation issues") {
  return render(
    <MemoryRouter>
      <ValidationIssues issues={issues} label={label} />
    </MemoryRouter>,
  );
}

describe("ValidationIssues", () => {
  it("puts each issue on a row", () => {
    renderIssues([issue(), issue({ invoice_id: 43, field: "invoice_date" })]);
    // Two body rows plus the header.
    expect(screen.getAllByRole("row")).toHaveLength(3);
  });

  it("says what the problem was", () => {
    renderIssues([issue()]);
    expect(screen.getByText("A GSTIN is 15 characters.")).toBeInTheDocument();
  });

  describe("the field name", () => {
    // It arrives as the model attribute. Underscores stripped is the whole
    // translation, deliberately: a lookup table mapping every field to prose
    // is one more place to forget a field, and the column is legible without.
    it("reads as words rather than as an attribute name", () => {
      renderIssues([issue({ field: "counterparty_gstin" })]);
      expect(screen.getByText("counterparty gstin")).toBeInTheDocument();
    });

    it("strips every underscore, not just the first", () => {
      renderIssues([issue({ field: "place_of_supply" })]);
      expect(screen.getByText("place of supply")).toBeInTheDocument();
    });

    it("leaves a field that has none alone", () => {
      renderIssues([issue({ field: "cgst" })]);
      expect(screen.getByText("cgst")).toBeInTheDocument();
    });
  });

  describe("the severity", () => {
    it("calls an error an error", () => {
      renderIssues([issue({ severity: "error" })]);
      expect(screen.getByText("Error")).toBeInTheDocument();
    });

    it("calls anything else a warning", () => {
      // The two are not cosmetic: an error blocks the return and a warning
      // does not, so a severity the client does not recognise must land on the
      // side that does not claim the filing is blocked.
      renderIssues([issue({ severity: "warning" })]);
      expect(screen.getByText("Warning")).toBeInTheDocument();
    });

    it("does not call an unknown severity an error", () => {
      renderIssues([issue({ severity: "advisory" })]);
      expect(screen.getByText("Warning")).toBeInTheDocument();
      expect(screen.queryByText("Error")).toBeNull();
    });
  });

  describe("getting to the invoice", () => {
    // Every one of these is fixed by opening the invoice — a GSTIN retyped, a
    // missing number filled in — so the number is the way there.
    it("links the invoice number where the server gave an id", () => {
      renderIssues([issue({ invoice_id: 42, invoice_number: "INV-2026-0042" })]);
      expect(screen.getByRole("link", { name: "INV-2026-0042" })).toHaveAttribute(
        "href",
        "/invoices/42",
      );
    });

    it("leaves a period-level issue as text with nowhere to go", () => {
      // An unreadable extraction is raised against the period rather than a
      // row, so it has no id — and a link to /invoices/null is worse than no
      // link, because it looks like somewhere to click.
      renderIssues([issue({ invoice_id: null, invoice_number: null })]);
      expect(screen.queryByRole("link")).toBeNull();
    });

    it("names an invoice that has no number so the row is not blank", () => {
      // The unreadable number is often the issue being reported. A blank cell
      // gives the reader no way to tell that row from a rendering fault.
      renderIssues([issue({ invoice_id: 42, invoice_number: null })]);
      expect(screen.getByRole("link", { name: "(no number)" })).toHaveAttribute(
        "href",
        "/invoices/42",
      );
    });

    it("says the same when there is neither a number nor an id", () => {
      renderIssues([issue({ invoice_id: null, invoice_number: "" })]);
      expect(screen.getByText("(no number)")).toBeInTheDocument();
      expect(screen.queryByRole("link")).toBeNull();
    });
  });

  describe("the region it renders into", () => {
    // The caller supplies the label because it names the stop a keyboard
    // lands on, and the two screens that use this both have one on screen at
    // once during a reconciliation — "Validation issues" twice would be two
    // identically named stops.
    it("is named by the caller rather than by the component", () => {
      renderIssues([issue()], "Purchase register problems for April 2026");
      expect(
        screen.getByRole("region", { name: "Purchase register problems for April 2026" }),
      ).toBeInTheDocument();
    });

    it("keeps the column headers scoped to their columns", () => {
      renderIssues([issue()]);
      const headers = screen.getAllByRole("columnheader");
      expect(headers.map((h) => h.textContent)).toEqual([
        "Severity",
        "Invoice",
        "Field",
        "Problem",
      ]);
      for (const header of headers) expect(header).toHaveAttribute("scope", "col");
    });
  });

  describe("when two issues look alike", () => {
    // The key is id-field-index. Two issues can share both an invoice and a
    // field — a date that is both malformed and after the period — and a key
    // built from the pair alone would drop one of them.
    it("keeps both rows rather than collapsing them", () => {
      renderIssues([
        issue({ field: "invoice_date", message: "Not a date." }),
        issue({ field: "invoice_date", message: "After the period ends." }),
      ]);
      expect(screen.getByText("Not a date.")).toBeInTheDocument();
      expect(screen.getByText("After the period ends.")).toBeInTheDocument();
    });

    it("keeps rows apart when neither has an id", () => {
      renderIssues([
        issue({ invoice_id: null, field: "period", message: "Nothing extracted." }),
        issue({ invoice_id: null, field: "period", message: "No register uploaded." }),
      ]);
      expect(screen.getAllByRole("row")).toHaveLength(3);
    });
  });

  describe("when the report found nothing", () => {
    it("still renders the table rather than a bare region", () => {
      // Both callers gate on the count before rendering this at all, so an
      // empty list is the shape it must survive rather than the shape it is
      // asked to explain — headers with no rows under them, not a crash.
      renderIssues([]);
      const region = screen.getByRole("region", { name: "Validation issues" });
      expect(within(region).getAllByRole("columnheader")).toHaveLength(4);
      expect(screen.getAllByRole("row")).toHaveLength(1);
    });
  });
});
