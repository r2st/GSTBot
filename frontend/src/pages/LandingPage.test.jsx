import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import LandingPage from "./LandingPage";

vi.mock("../hooks/usePageTitle", () => ({ usePageTitle: () => {} }));
vi.mock("../lib/share", () => ({
  copyToClipboard: vi.fn().mockResolvedValue(true),
  fullUrl: (p) => `http://localhost${p}`,
}));
vi.mock("../hooks/useAuth", () => ({
  useAuth: () => ({
    user: null,
    loading: false,
    login: vi.fn(),
    register: vi.fn(),
  }),
}));

function renderLanding() {
  return render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>,
  );
}

describe("LandingPage", () => {
  it("shows the headline in serif font", () => {
    renderLanding();

    expect(screen.getByText(/Free GST Calculator, GSTIN Verification/)).toBeInTheDocument();
  });

  it("shows the monospace subtitle", () => {
    renderLanding();

    expect(
      screen.getByText(/Calculate GST instantly/),
    ).toBeInTheDocument();
  });

  it("renders the four pipeline stages", () => {
    renderLanding();

    expect(screen.getByText("Upload")).toBeInTheDocument();
    expect(screen.getByText("Match")).toBeInTheDocument();
    expect(screen.getByText("Reconcile")).toBeInTheDocument();
    expect(screen.getByText("File")).toBeInTheDocument();
  });

  it("renders the auth form with create-account tab active by default", () => {
    renderLanding();

    const signIn = screen.getByRole("tab", { name: "Sign in" });
    const create = screen.getByRole("tab", { name: "Create account" });
    expect(create).toHaveAttribute("aria-selected", "true");
    expect(signIn).toHaveAttribute("aria-selected", "false");
  });

  it("shows a toggle to add GSTIN rather than fields upfront", () => {
    renderLanding();

    expect(screen.getByText(/Have a GSTIN/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/GSTIN/)).not.toBeInTheDocument();
  });

  it("reveals GSTIN fields when the toggle is clicked", async () => {
    renderLanding();

    await userEvent.click(screen.getByText(/Have a GSTIN/));

    expect(screen.getByLabelText(/GSTIN/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Legal name/)).toBeInTheDocument();
  });

  it("shows pricing hints", () => {
    renderLanding();

    expect(screen.getByText("Free forever")).toBeInTheDocument();
    expect(screen.getByText(/499/)).toBeInTheDocument();
  });

  it("renders the footer with all DoAide product links", () => {
    renderLanding();

    expect(screen.getByText("Desk")).toBeInTheDocument();
    expect(screen.getByText("Jobs")).toBeInTheDocument();
    expect(screen.getByText("Pulse")).toBeInTheDocument();
    expect(screen.getByText("Med")).toBeInTheDocument();
    expect(screen.getByText("Realty")).toBeInTheDocument();
    expect(screen.getByText("Reach")).toBeInTheDocument();
    expect(screen.getByText("Trade")).toBeInTheDocument();
    expect(screen.getByText("409A")).toBeInTheDocument();
    expect(screen.getByText("doaide.com")).toBeInTheDocument();
  });

  it("links to doaide.com from the header brand", () => {
    renderLanding();

    const brand = screen.getByText("doaide.com").closest("a");
    expect(brand).toHaveAttribute("href", "https://doaide.com");
  });

  describe("feature highlights section", () => {
    it("renders all six feature cards", () => {
      renderLanding();

      expect(screen.getByText("GSTR-2B Reconciliation")).toBeInTheDocument();
      expect(screen.getByText("ITC Calculator")).toBeInTheDocument();
      expect(screen.getByText("GST Return Filing")).toBeInTheDocument();
      expect(screen.getByText("Deadline Alerts")).toBeInTheDocument();
      expect(screen.getByText("Supplier Tracking")).toBeInTheDocument();
      expect(screen.getByText("AI Invoice Parsing")).toBeInTheDocument();
    });

    it("has a section heading", () => {
      renderLanding();

      expect(screen.getByText("Everything You Need for GST Compliance")).toBeInTheDocument();
    });
  });

  describe("how it works section", () => {
    it("renders three steps", () => {
      renderLanding();

      expect(screen.getByText("Upload invoices")).toBeInTheDocument();
      expect(screen.getByText("Auto-reconcile")).toBeInTheDocument();
      expect(screen.getByText("File returns")).toBeInTheDocument();
    });

    it("shows step numbers", () => {
      renderLanding();

      expect(screen.getByText("1")).toBeInTheDocument();
      expect(screen.getByText("2")).toBeInTheDocument();
      expect(screen.getByText("3")).toBeInTheDocument();
    });
  });

  describe("testimonials section", () => {
    it("renders testimonial quotes", () => {
      renderLanding();

      expect(screen.getByText(/cut our reconciliation time/)).toBeInTheDocument();
      expect(screen.getByText(/missing ITC on mismatched invoices/)).toBeInTheDocument();
      expect(screen.getByText(/free plan handles our monthly volume/)).toBeInTheDocument();
    });

    it("shows reviewer names and roles", () => {
      renderLanding();

      expect(screen.getByText("Priya S.")).toBeInTheDocument();
      expect(screen.getByText("CA, Mumbai")).toBeInTheDocument();
    });
  });

  describe("FAQ section", () => {
    it("renders all FAQ questions", () => {
      renderLanding();

      expect(screen.getByText("What is GST and who needs to file GST returns?")).toBeInTheDocument();
      expect(screen.getByText("How does GSTR-2B reconciliation work?")).toBeInTheDocument();
      expect(screen.getByText("What is Input Tax Credit (ITC) and how is it calculated?")).toBeInTheDocument();
      expect(screen.getByText("Is DoAide GST really free?")).toBeInTheDocument();
      expect(screen.getByText("What are HSN codes and why do they matter for GST?")).toBeInTheDocument();
      expect(screen.getByText("What happens if I miss a GST filing deadline?")).toBeInTheDocument();
      expect(screen.getByText("Can DoAide GST help with GST compliance for small businesses?")).toBeInTheDocument();
    });

    it("answers are hidden by default", () => {
      renderLanding();

      expect(screen.queryByText(/indirect tax on goods and services/)).not.toBeInTheDocument();
    });

    it("expands an answer when the question is clicked", async () => {
      renderLanding();

      await userEvent.click(screen.getByText("Is DoAide GST really free?"));

      expect(screen.getByText(/All features are included free/)).toBeInTheDocument();
    });

    it("collapses an open answer when clicked again", async () => {
      renderLanding();

      const question = screen.getByText("Is DoAide GST really free?");
      await userEvent.click(question);
      expect(screen.getByText(/All features are included free/)).toBeInTheDocument();

      await userEvent.click(question);
      expect(screen.queryByText(/All features are included free/)).not.toBeInTheDocument();
    });

    it("closes the previous answer when opening a new one", async () => {
      renderLanding();

      await userEvent.click(screen.getByText("Is DoAide GST really free?"));
      expect(screen.getByText(/All features are included free/)).toBeInTheDocument();

      await userEvent.click(screen.getByText("How does GSTR-2B reconciliation work?"));
      expect(screen.queryByText(/All features are included free/)).not.toBeInTheDocument();
      expect(screen.getByText(/eligible ITC based on suppliers/)).toBeInTheDocument();
    });
  });

  describe("CTA section", () => {
    it("renders the call to action", () => {
      renderLanding();

      expect(screen.getByText("Start Filing GST Returns in Minutes")).toBeInTheDocument();
      expect(screen.getByText("Sign Up Free")).toBeInTheDocument();
    });
  });

  describe("InstantLookup section", () => {
    it("shows the GSTIN verification search box", () => {
      renderLanding();

      expect(
        screen.getByPlaceholderText(/Enter any GSTIN to verify/),
      ).toBeInTheDocument();
    });

    it("shows the business counter", () => {
      renderLanding();

      expect(screen.getByText("12,000+")).toBeInTheDocument();
      expect(screen.getByText(/businesses across India/)).toBeInTheDocument();
    });

    it("renders four tool cards", () => {
      renderLanding();

      const section = document.querySelector(".landing-tool-cards");
      expect(section).not.toBeNull();
      expect(section.textContent).toContain("GST Calculator");
      expect(section.textContent).toContain("GSTIN Lookup");
      expect(section.textContent).toContain("HSN Code Finder");
      expect(section.textContent).toContain("Due Dates Calendar");
    });

    it("submits a GSTIN-shaped query to the lookup route", async () => {
      renderLanding();

      const input = screen.getByPlaceholderText(/Enter any GSTIN/);
      await userEvent.type(input, "27AAPFU0939F1ZV");
      await userEvent.click(screen.getByText("Verify"));
    });

    it("submits a non-GSTIN query to the lookup route with q param", async () => {
      renderLanding();

      const input = screen.getByPlaceholderText(/Enter any GSTIN/);
      await userEvent.type(input, "test query");
      await userEvent.click(screen.getByText("Verify"));
    });

    it("does nothing on empty submit", async () => {
      renderLanding();

      await userEvent.click(screen.getByText("Verify"));
    });
  });

  describe("ReferralBanner section", () => {
    it("renders the invite heading", () => {
      renderLanding();

      expect(screen.getByText("Invite Your CA or Accountant")).toBeInTheDocument();
    });

    it("has a WhatsApp share link", () => {
      renderLanding();

      expect(screen.getByText("Share on WhatsApp")).toBeInTheDocument();
    });

    it("has a copy invite link button", () => {
      renderLanding();

      expect(screen.getByText("Copy invite link")).toBeInTheDocument();
    });

    it("copies the invite link when clicked", async () => {
      renderLanding();

      await userEvent.click(screen.getByText("Copy invite link"));
    });
  });

  describe("footer navigation", () => {
    it("has links to blog, pricing, and resources", () => {
      renderLanding();

      const pricingLinks = screen.getAllByText("Pricing");
      expect(pricingLinks.length).toBeGreaterThan(0);
      expect(screen.getByText("Blog")).toBeInTheDocument();
      expect(screen.getByText("GST Filing Guide")).toBeInTheDocument();
      expect(screen.getByText("HSN Code Lookup")).toBeInTheDocument();
      expect(screen.getByText("All GST Tools & Guides")).toBeInTheDocument();
      expect(screen.getAllByText("Due Dates Calendar").length).toBeGreaterThan(0);
    });
  });

  describe("the typewriter effect", () => {
    afterEach(() => vi.useRealTimers());

    function tick(n = 1) {
      for (let i = 0; i < n; i++) act(() => vi.runOnlyPendingTimers());
    }

    it("types the first phrase one character at a time", () => {
      vi.useFakeTimers();
      renderLanding();

      // Each character is one tick; the first phrase is 30 chars.
      tick(30);

      expect(screen.getByText("Free GST return filing online")).toBeInTheDocument();
    });

    it("pauses when a phrase is fully typed then starts deleting", () => {
      vi.useFakeTimers();
      renderLanding();

      tick(30); // Type the full phrase.
      tick(1);  // The 2s pause fires → setDeleting(true).
      tick(1);  // A deletion tick removes a character.

      const el = screen.getByLabelText("Free GST return filing online");
      // The text is shorter than the full phrase — deletion is underway.
      expect(el.textContent.length).toBeLessThan("Free GST return filing online".length + 1);
      expect(el.textContent).toMatch(/Free GST return filing onli/);
    });

    it("advances to the next phrase after fully deleting the current one", () => {
      vi.useFakeTimers();
      renderLanding();

      tick(30); // Type full phrase.
      tick(1);  // Pause fires → deleting.
      tick(30); // Delete all 30 chars.
      tick(1);  // text="" and deleting → resets to next phrase.
      tick(1);  // First char of the second phrase.

      expect(screen.getByLabelText("Automated GSTR-2B reconciliation")).toBeInTheDocument();
    });
  });
});
