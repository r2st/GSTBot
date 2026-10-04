import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import DueDatesPage from "./DueDatesPage";
import { buildDeadlines, RETURN_TYPES } from "./DueDatesPage";

vi.mock("../hooks/usePageTitle", () => ({ usePageTitle: () => {} }));
vi.mock("../lib/share", () => ({
  fullUrl: (p) => `http://localhost${p}`,
  whatsappUrl: (text, url) => `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`,
  twitterUrl: (text, url) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
  copyToClipboard: vi.fn().mockResolvedValue(true),
}));

vi.mock("../lib/track", () => ({ track: vi.fn() }));

function renderPage(route = "/due-dates") {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <DueDatesPage />
    </MemoryRouter>,
  );
}

describe("DueDatesPage", () => {
  it("renders the page title and subtitle", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("GST Filing Due Dates Calendar");
    expect(screen.getByText(/Never miss a deadline/)).toBeInTheDocument();
  });

  it("shows the ToolsNav component", () => {
    renderPage();
    expect(screen.getByRole("navigation", { name: "GST tools" })).toBeInTheDocument();
  });

  it("defaults to FY 2026-27", () => {
    renderPage();
    const buttons = screen.getAllByRole("button");
    const fy2627 = buttons.find((b) => b.textContent === "FY 2026-27");
    expect(fy2627).toHaveClass("active");
  });

  it("switches to FY 2025-26 when clicked", async () => {
    const user = userEvent.setup();
    renderPage();
    const fy2526Btn = screen.getByRole("button", { name: "FY 2025-26" });
    await user.click(fy2526Btn);
    expect(fy2526Btn).toHaveClass("active");
    // The table should now show April 2025 as the first tax period
    expect(screen.getByText("April 2025")).toBeInTheDocument();
  });

  it("displays all six return type columns", () => {
    renderPage();
    const table = screen.getByRole("table");
    const headers = within(table).getAllByRole("columnheader");
    // Tax Period + 6 return types
    expect(headers).toHaveLength(7);
    RETURN_TYPES.forEach((rt) => {
      expect(within(table).getByRole("columnheader", { name: rt.label })).toBeInTheDocument();
    });
  });

  it("shows twelve monthly rows plus one annual row", () => {
    renderPage();
    const table = screen.getByRole("table");
    const rows = within(table).getAllByRole("row");
    // 1 header + 12 monthly + 1 annual = 14
    expect(rows).toHaveLength(14);
  });

  it("marks the annual row distinctly", () => {
    renderPage();
    const table = screen.getByRole("table");
    const annualCell = within(table).getByText(/Annual/);
    expect(annualCell.closest("tr")).toHaveClass("due-dates-annual-row");
  });

  it("shows GSTR-9 and GSTR-9C only in the annual row", () => {
    renderPage();
    const table = screen.getByRole("table");
    const rows = within(table).getAllByRole("row");
    // Monthly rows (indices 1-12) should have "—" for GSTR-9 and GSTR-9C
    for (let i = 1; i <= 12; i++) {
      const cells = within(rows[i]).getAllByRole("cell");
      // GSTR-9 is column index 3 (0=period, 1=gstr1, 2=gstr3b, 3=gstr9)
      expect(cells[3]).toHaveTextContent("—");
      // GSTR-9C is column index 4
      expect(cells[4]).toHaveTextContent("—");
    }
    // Annual row should have actual dates
    const annualRow = rows[13];
    const annualCells = within(annualRow).getAllByRole("cell");
    expect(annualCells[3]).toHaveTextContent(/31st Dec/);
    expect(annualCells[4]).toHaveTextContent(/31st Dec/);
  });

  it("shows CMP-08 only for quarter-end months", () => {
    renderPage();
    const table = screen.getByRole("table");
    const rows = within(table).getAllByRole("row");
    // Quarter-end months in FY: June(idx 3), Sep(idx 6), Dec(idx 9), Mar(idx 12)
    for (let i = 1; i <= 12; i++) {
      const cells = within(rows[i]).getAllByRole("cell");
      // CMP-08 is column index 5
      if ([3, 6, 9, 12].includes(i)) {
        expect(cells[5]).toHaveTextContent(/18th/);
      } else {
        expect(cells[5]).toHaveTextContent("—");
      }
    }
  });

  it("shows IFF only for non-quarter-end months", () => {
    renderPage();
    const table = screen.getByRole("table");
    const rows = within(table).getAllByRole("row");
    for (let i = 1; i <= 12; i++) {
      const cells = within(rows[i]).getAllByRole("cell");
      // IFF is column index 6
      if ([3, 6, 9, 12].includes(i)) {
        expect(cells[6]).toHaveTextContent("—");
      } else {
        expect(cells[6]).toHaveTextContent(/13th/);
      }
    }
  });

  it("shows share buttons", () => {
    renderPage();
    expect(screen.getByRole("group", { name: "Share this result" })).toBeInTheDocument();
  });

  it("renders the return type legend", () => {
    renderPage();
    const legend = screen.getByRole("list", { name: "Return types" });
    RETURN_TYPES.forEach((rt) => {
      expect(within(legend).getByText(rt.label)).toBeInTheDocument();
    });
  });

  it("includes informational sections about GST deadlines", () => {
    renderPage();
    expect(screen.getByText("Understanding GST Filing Deadlines")).toBeInTheDocument();
    expect(screen.getByText("Monthly vs Quarterly Filing")).toBeInTheDocument();
    expect(screen.getByText("Annual Returns")).toBeInTheDocument();
    expect(screen.getByText(/Composition Scheme/)).toBeInTheDocument();
  });

  it("renders JSON-LD FAQ structured data", () => {
    renderPage();
    const script = document.querySelector('script[type="application/ld+json"]');
    expect(script).not.toBeNull();
    const data = JSON.parse(script.textContent);
    expect(data["@type"]).toBe("FAQPage");
    expect(data.mainEntity).toHaveLength(6);
  });
});

describe("buildDeadlines", () => {
  it("returns thirteen entries for a financial year", () => {
    const rows = buildDeadlines(2026);
    expect(rows).toHaveLength(13);
  });

  it("starts with April of the start year", () => {
    const rows = buildDeadlines(2026);
    expect(rows[0].taxPeriod).toBe("April 2026");
  });

  it("ends with the annual return row", () => {
    const rows = buildDeadlines(2026);
    expect(rows[12].taxPeriod).toContain("Annual");
    expect(rows[12].gstr9).toContain("2027");
  });

  it("includes GSTR-1 with 11th due date for every monthly row", () => {
    const rows = buildDeadlines(2026);
    for (let i = 0; i < 12; i++) {
      expect(rows[i].gstr1).toContain("11th");
    }
  });
});
