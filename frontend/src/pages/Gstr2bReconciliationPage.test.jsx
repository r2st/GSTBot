import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import Gstr2bReconciliationPage, { invoiceTax, matchKey, parseCSV, reconcile } from "./Gstr2bReconciliationPage";

vi.mock("../hooks/usePageTitle", () => ({ usePageTitle: () => {} }));
vi.mock("../hooks/useAuth", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("../lib/share", () => ({
  fullUrl: (p) => `http://localhost${p}`,
  whatsappUrl: (text, url) => `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`,
  twitterUrl: (text, url) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
  copyToClipboard: vi.fn().mockResolvedValue(true),
}));
vi.mock("../lib/api", () => ({
  api: { subscribe: vi.fn().mockResolvedValue({ subscribed: true, new: true, message: "Done" }) },
}));
vi.mock("../lib/track", () => ({ track: () => {} }));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/gstr2b-reconciliation"]}>
      <Gstr2bReconciliationPage />
    </MemoryRouter>,
  );
}

describe("Gstr2bReconciliationPage", () => {
  it("renders the title and description", () => {
    renderPage();
    expect(screen.getByText("GSTR-2B Reconciliation Helper")).toBeInTheDocument();
    expect(screen.getByText(/Match your purchase register/)).toBeInTheDocument();
  });

  it("shows no results before data is loaded", () => {
    renderPage();
    expect(screen.queryByText("Reconciliation Results")).not.toBeInTheDocument();
  });

  it("loads sample data and shows reconciliation results", () => {
    renderPage();
    fireEvent.click(screen.getByText("Load Sample Data"));
    expect(screen.getByText("Reconciliation Results")).toBeInTheDocument();
    expect(screen.getByText("ITC at Risk")).toBeInTheDocument();
  });

  it("shows ITC at risk for missing invoices in sample data", () => {
    renderPage();
    fireEvent.click(screen.getByText("Load Sample Data"));
    expect(screen.getByText("ITC at Risk")).toBeInTheDocument();
  });

  it("renders the FAQ section", () => {
    renderPage();
    expect(screen.getByText("Frequently Asked Questions")).toBeInTheDocument();
    expect(screen.getByText(/What is GSTR-2B reconciliation/)).toBeInTheDocument();
  });

  it("renders CSV format instructions", () => {
    renderPage();
    expect(screen.getByText("CSV Format")).toBeInTheDocument();
  });
});

describe("parseCSV", () => {
  it("parses a valid CSV with standard headers", () => {
    const csv = "gstin,invoice_no,date,taxable,igst,cgst,sgst\n29AABCU9603R1ZM,INV-001,2026-09-05,50000,0,4500,4500";
    const result = parseCSV(csv);
    expect(result).toHaveLength(1);
    expect(result[0].gstin).toBe("29AABCU9603R1ZM");
    expect(result[0].invoiceNo).toBe("INV-001");
    expect(result[0].taxable).toBe(50000);
    expect(result[0].cgst).toBe(4500);
    expect(result[0].sgst).toBe(4500);
  });

  it("handles alternate header names", () => {
    const csv = "supplier_gstin,invoiceno,date,taxable_value,igst,cgst,sgst\n07AAAA0000A1ZZ,INV-X,2026-01-01,10000,1800,0,0";
    const result = parseCSV(csv);
    expect(result).toHaveLength(1);
    expect(result[0].gstin).toBe("07AAAA0000A1ZZ");
    expect(result[0].igst).toBe(1800);
  });

  it("returns empty array for insufficient rows", () => {
    expect(parseCSV("just a header")).toEqual([]);
    expect(parseCSV("")).toEqual([]);
  });
});

describe("invoiceTax", () => {
  it("sums IGST, CGST, and SGST", () => {
    expect(invoiceTax({ igst: 0, cgst: 4500, sgst: 4500 })).toBe(9000);
  });

  it("handles IGST-only invoices", () => {
    expect(invoiceTax({ igst: 21600, cgst: 0, sgst: 0 })).toBe(21600);
  });
});

describe("matchKey", () => {
  it("normalizes whitespace and case", () => {
    expect(matchKey({ gstin: "29aabcu9603r1zm", invoiceNo: "inv-001" }))
      .toBe(matchKey({ gstin: "29AABCU9603R1ZM", invoiceNo: "INV-001" }));
  });
});

describe("reconcile", () => {
  const purchase = [
    { gstin: "29AABCU9603R1ZM", invoiceNo: "INV-001", date: "", taxable: 50000, igst: 0, cgst: 4500, sgst: 4500 },
    { gstin: "27AADCB2230M1ZT", invoiceNo: "INV-002", date: "", taxable: 100000, igst: 18000, cgst: 0, sgst: 0 },
  ];
  const gstr2b = [
    { gstin: "29AABCU9603R1ZM", invoiceNo: "INV-001", date: "", taxable: 50000, igst: 0, cgst: 4500, sgst: 4500 },
    { gstin: "06AABCT1332L1ZI", invoiceNo: "INV-099", date: "", taxable: 20000, igst: 0, cgst: 1800, sgst: 1800 },
  ];

  it("identifies matched invoices", () => {
    const result = reconcile(purchase, gstr2b);
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].purchase.invoiceNo).toBe("INV-001");
  });

  it("identifies invoices only in purchase register", () => {
    const result = reconcile(purchase, gstr2b);
    expect(result.onlyInPurchase).toHaveLength(1);
    expect(result.onlyInPurchase[0].invoiceNo).toBe("INV-002");
  });

  it("identifies invoices only in GSTR-2B", () => {
    const result = reconcile(purchase, gstr2b);
    expect(result.onlyInGstr2b).toHaveLength(1);
    expect(result.onlyInGstr2b[0].invoiceNo).toBe("INV-099");
  });

  it("calculates ITC at risk for missing invoices", () => {
    const result = reconcile(purchase, gstr2b);
    expect(result.itcAtRisk).toBe(18000);
  });

  it("detects amount mismatches", () => {
    const p = [{ gstin: "29AAA", invoiceNo: "INV-1", date: "", taxable: 10000, igst: 0, cgst: 900, sgst: 900 }];
    const g = [{ gstin: "29AAA", invoiceNo: "INV-1", date: "", taxable: 10000, igst: 0, cgst: 1000, sgst: 1000 }];
    const result = reconcile(p, g);
    expect(result.mismatched).toHaveLength(1);
    expect(result.mismatched[0].diff).toBe(-200);
  });

  it("returns zero ITC at risk when everything matches", () => {
    const result = reconcile(
      [{ gstin: "AAA", invoiceNo: "I1", date: "", taxable: 1000, igst: 180, cgst: 0, sgst: 0 }],
      [{ gstin: "AAA", invoiceNo: "I1", date: "", taxable: 1000, igst: 180, cgst: 0, sgst: 0 }],
    );
    expect(result.itcAtRisk).toBe(0);
    expect(result.matched).toHaveLength(1);
  });
});
