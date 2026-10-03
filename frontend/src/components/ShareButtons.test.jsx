import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import ShareButtons from "./ShareButtons";

vi.mock("../lib/share", () => ({
  fullUrl: (p) => `http://localhost${p}`,
  whatsappUrl: (text, url) =>
    `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`,
  twitterUrl: (text, url) =>
    `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
  copyToClipboard: vi.fn(),
}));

const mockTrack = vi.fn();
vi.mock("../lib/track", () => ({ track: (...args) => mockTrack(...args) }));

import { copyToClipboard } from "../lib/share";

function renderShare(props = {}) {
  return render(
    <MemoryRouter>
      <ShareButtons path="/calculator" text="Check this out" {...props} />
    </MemoryRouter>,
  );
}

describe("ShareButtons", () => {
  afterEach(() => vi.restoreAllMocks());

  it("renders WhatsApp, Twitter and Copy link actions", () => {
    renderShare();

    expect(screen.getByLabelText("Share on WhatsApp")).toBeInTheDocument();
    expect(screen.getByLabelText("Share on Twitter")).toBeInTheDocument();
    expect(screen.getByLabelText("Copy link")).toBeInTheDocument();
  });

  it("builds the correct WhatsApp href", () => {
    renderShare();

    const link = screen.getByLabelText("Share on WhatsApp");
    expect(link).toHaveAttribute("href");
    expect(link.getAttribute("href")).toContain("wa.me");
  });

  it("builds the correct Twitter href", () => {
    renderShare();

    const link = screen.getByLabelText("Share on Twitter");
    expect(link.getAttribute("href")).toContain("twitter.com/intent/tweet");
  });

  it("shows Copied! after clicking copy", async () => {
    copyToClipboard.mockResolvedValue(true);
    renderShare();

    await userEvent.click(screen.getByLabelText("Copy link"));

    expect(copyToClipboard).toHaveBeenCalledWith("http://localhost/calculator");
    expect(screen.getByText("Copied!")).toBeInTheDocument();
  });

  it("uses the custom label as group aria-label", () => {
    renderShare({ label: "Share GST result" });

    expect(screen.getByRole("group", { name: "Share GST result" })).toBeInTheDocument();
  });

  it("fires share_whatsapp tracking event when WhatsApp is clicked", async () => {
    renderShare();

    await userEvent.click(screen.getByLabelText("Share on WhatsApp"));

    expect(mockTrack).toHaveBeenCalledWith("share_whatsapp");
  });

  it("fires share_twitter tracking event when Twitter is clicked", async () => {
    renderShare();

    await userEvent.click(screen.getByLabelText("Share on Twitter"));

    expect(mockTrack).toHaveBeenCalledWith("share_twitter");
  });

  it("fires share_copy tracking event when link is copied", async () => {
    copyToClipboard.mockResolvedValue(true);
    renderShare();

    await userEvent.click(screen.getByLabelText("Copy link"));

    expect(mockTrack).toHaveBeenCalledWith("share_copy");
  });

  it("reverts copy text after timeout", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    copyToClipboard.mockResolvedValue(true);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderShare();

    await user.click(screen.getByLabelText("Copy link"));

    expect(screen.getByText("Copied!")).toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(2000);

    expect(screen.getByText("Copy link")).toBeInTheDocument();

    vi.useRealTimers();
  });
});
