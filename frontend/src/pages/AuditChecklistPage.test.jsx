import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import AuditChecklistPage from "./AuditChecklistPage";

vi.mock("../hooks/usePageTitle", () => ({ usePageTitle: () => {} }));
vi.mock("../lib/share", () => ({
  fullUrl: (p) => `http://localhost${p}`,
  whatsappUrl: (text, url) => `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`,
  twitterUrl: (text, url) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
  copyToClipboard: vi.fn().mockResolvedValue(true),
}));
vi.mock("../lib/api", () => ({
  api: { subscribe: vi.fn().mockResolvedValue({ subscribed: true, new: true, message: "Done" }) },
}));
vi.mock("../lib/track", () => ({ track: vi.fn() }));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/audit-checklist"]}>
      <AuditChecklistPage />
    </MemoryRouter>,
  );
}

describe("AuditChecklistPage", () => {
  it("renders the title and progress", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "GST Audit Checklist" })).toBeInTheDocument();
    expect(screen.getByText("0%")).toBeInTheDocument();
  });

  it("renders all checklist categories", () => {
    renderPage();
    const headings = screen.getAllByRole("heading", { level: 2 });
    const headingTexts = headings.map((h) => h.textContent);
    expect(headingTexts).toEqual(expect.arrayContaining([
      expect.stringContaining("Registration"),
      expect.stringContaining("Outward Supply"),
      expect.stringContaining("Inward Supply"),
      expect.stringContaining("Input Tax Credit"),
      expect.stringContaining("Tax Payment"),
      expect.stringContaining("Reverse Charge"),
      expect.stringContaining("HSN/SAC"),
      expect.stringContaining("E-Way Bill"),
      expect.stringContaining("Specific Verifications"),
    ]));
  });

  it("updates progress when items are checked", async () => {
    renderPage();
    const checkboxes = screen.getAllByRole("checkbox");
    await userEvent.click(checkboxes[0]);
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
  });

  it("shows completion message at 100%", async () => {
    renderPage();
    const checkboxes = screen.getAllByRole("checkbox");
    for (const cb of checkboxes) {
      await userEvent.click(cb);
    }
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByText(/audit preparation is complete/)).toBeInTheDocument();
  });
});
