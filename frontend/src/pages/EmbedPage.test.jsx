import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import EmbedPage from "./EmbedPage";

vi.mock("../hooks/usePageTitle", () => ({ usePageTitle: () => {} }));

const mockCopyToClipboard = vi.fn();
vi.mock("../lib/share", () => ({
  copyToClipboard: (...args) => mockCopyToClipboard(...args),
  widgetEmbedSnippet: (tool, opts = {}) => {
    if (tool === "calculator") {
      const params = new URLSearchParams();
      if (opts.theme) params.set("theme", opts.theme);
      return `<iframe src="http://localhost/widget?${params.toString()}" width="${opts.width || "100%"}" height="460"></iframe>`;
    }
    return `<iframe src="http://localhost/embed/${tool}" width="100%" height="400"></iframe>`;
  },
}));

const mockTrack = vi.fn();
vi.mock("../lib/track", () => ({ track: (...args) => mockTrack(...args) }));

function renderEmbed() {
  return render(
    <MemoryRouter initialEntries={["/embed"]}>
      <EmbedPage />
    </MemoryRouter>,
  );
}

describe("EmbedPage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("renders the embed page title", () => {
    renderEmbed();
    expect(screen.getByText("Embed GST Tools on Your Website")).toBeInTheDocument();
  });

  it("shows three tool options", () => {
    renderEmbed();
    const group = screen.getByRole("group", { name: "Choose tool to embed" });
    expect(group).toBeInTheDocument();
    expect(screen.getAllByText("GST Calculator").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("GSTIN Lookup").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("HSN Code Finder").length).toBeGreaterThanOrEqual(1);
  });

  it("shows embed code for the default selected tool", () => {
    renderEmbed();
    expect(screen.getByText(/iframe.*widget/)).toBeInTheDocument();
  });

  it("switches embed code when a different tool is selected", async () => {
    renderEmbed();
    const group = screen.getByRole("group", { name: "Choose tool to embed" });
    const lookupBtn = Array.from(group.querySelectorAll("button")).find(
      (b) => b.textContent.includes("GSTIN Lookup"),
    );
    await userEvent.click(lookupBtn);
    expect(screen.getByText(/iframe.*lookup/)).toBeInTheDocument();
  });

  it("copy button copies the embed snippet", async () => {
    mockCopyToClipboard.mockResolvedValue(true);
    renderEmbed();
    await userEvent.click(screen.getByText("Copy embed code"));
    expect(mockCopyToClipboard).toHaveBeenCalledWith(
      expect.stringContaining("<iframe"),
    );
    expect(screen.getByText("Copied!")).toBeInTheDocument();
  });

  it("renders the subtitle about no sign-up", () => {
    renderEmbed();
    expect(screen.getByText(/No sign-up required/)).toBeInTheDocument();
  });

  it("fires embed_copy tracking event when embed code is copied", async () => {
    mockCopyToClipboard.mockResolvedValue(true);
    renderEmbed();
    await userEvent.click(screen.getByText("Copy embed code"));
    expect(mockTrack).toHaveBeenCalledWith("embed_copy", { tool: "calculator", theme: "dark", rate: 18 });
  });

  it("shows customization options for calculator", () => {
    renderEmbed();
    expect(screen.getByText("Customize")).toBeInTheDocument();
    expect(screen.getByText("Theme")).toBeInTheDocument();
    expect(screen.getByText("Default GST rate")).toBeInTheDocument();
  });

  it("shows the live preview section", () => {
    renderEmbed();
    expect(screen.getByText("Live Preview")).toBeInTheDocument();
    expect(screen.getByTitle("Widget preview")).toBeInTheDocument();
  });

  it("hides customization and preview when a non-calculator tool is selected", async () => {
    renderEmbed();
    const group = screen.getByRole("group", { name: "Choose tool to embed" });
    const lookupBtn = Array.from(group.querySelectorAll("button")).find(
      (b) => b.textContent.includes("GSTIN Lookup"),
    );
    await userEvent.click(lookupBtn);
    expect(screen.queryByText("Customize")).not.toBeInTheDocument();
    expect(screen.queryByText("Live Preview")).not.toBeInTheDocument();
  });
});
