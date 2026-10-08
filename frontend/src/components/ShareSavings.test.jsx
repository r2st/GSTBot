import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ShareSavings, { buildMessage } from "./ShareSavings";

vi.mock("../lib/track", () => ({ track: vi.fn() }));

describe("buildMessage", () => {
  it("includes the tool name reference", () => {
    const msg = buildMessage("GST Calculator", 500);
    expect(msg).toContain("DoAide");
    expect(msg).toContain("gst.doaide.com");
  });

  it("includes saved amount when provided", () => {
    const msg = buildMessage("GST Calculator", 500);
    expect(msg).toContain("₹500");
  });

  it("works without saved amount", () => {
    const msg = buildMessage("GST Calculator");
    expect(msg).toContain("DoAide");
    expect(msg).not.toContain("₹");
  });

  it("includes referral parameter", () => {
    const msg = buildMessage("GST Calculator", 500);
    expect(msg).toContain("ref=share");
  });
});

describe("ShareSavings", () => {
  it("renders the share button", () => {
    render(<ShareSavings toolName="GST Calculator" savedAmount={500} />);
    expect(screen.getByText("Share on WhatsApp")).toBeInTheDocument();
  });

  it("renders the savings message text", () => {
    render(<ShareSavings toolName="GST Calculator" savedAmount={500} />);
    expect(screen.getByText("Saved money on GST consulting?")).toBeInTheDocument();
  });

  it("has a whatsapp link with wa.me", () => {
    render(<ShareSavings toolName="GST Calculator" savedAmount={500} />);
    const link = screen.getByText("Share on WhatsApp").closest("a");
    expect(link.href).toContain("wa.me");
  });

  it("includes no-print class", () => {
    const { container } = render(<ShareSavings />);
    expect(container.querySelector(".no-print")).toBeInTheDocument();
  });
});
