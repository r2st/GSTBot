import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import RecentLookups from "./RecentLookups";

const mockRecentLookups = vi.fn();

vi.mock("../lib/api", () => ({
  api: {
    recentLookups: (...args) => mockRecentLookups(...args),
  },
}));

describe("RecentLookups", () => {
  it("renders nothing when API returns empty", async () => {
    mockRecentLookups.mockResolvedValue({ lookups: [] });
    const { container } = render(
      <MemoryRouter><RecentLookups /></MemoryRouter>,
    );
    await waitFor(() => expect(mockRecentLookups).toHaveBeenCalled());
    expect(container.firstChild).toBeNull();
  });

  it("renders lookup items when API returns data", async () => {
    mockRecentLookups.mockResolvedValue({
      lookups: [
        { gstin: "27AAPFU0939F1ZV", state_name: "Maharashtra", valid: true },
        { gstin: "29AABCU9603R1ZM", state_name: "Karnataka", valid: true },
      ],
    });
    render(
      <MemoryRouter><RecentLookups /></MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText("Recently Verified Businesses")).toBeInTheDocument();
    });
    expect(screen.getByText("27AAPFU0939F1ZV")).toBeInTheDocument();
    expect(screen.getByText("Maharashtra")).toBeInTheDocument();
    expect(screen.getByText("29AABCU9603R1ZM")).toBeInTheDocument();
  });

  it("renders each item as a link to the GSTIN detail page", async () => {
    mockRecentLookups.mockResolvedValue({
      lookups: [
        { gstin: "27AAPFU0939F1ZV", state_name: "Maharashtra", valid: true },
      ],
    });
    render(
      <MemoryRouter><RecentLookups /></MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText("27AAPFU0939F1ZV")).toBeInTheDocument();
    });
    const link = screen.getByText("27AAPFU0939F1ZV").closest("a");
    expect(link).toHaveAttribute("href", "/gstin/27AAPFU0939F1ZV");
  });

  it("renders nothing when API fails", async () => {
    mockRecentLookups.mockRejectedValue(new Error("fail"));
    const { container } = render(
      <MemoryRouter><RecentLookups /></MemoryRouter>,
    );
    await waitFor(() => expect(mockRecentLookups).toHaveBeenCalled());
    expect(container.firstChild).toBeNull();
  });

  it("shows Active badge for valid GSTINs", async () => {
    mockRecentLookups.mockResolvedValue({
      lookups: [
        { gstin: "27AAPFU0939F1ZV", state_name: "Maharashtra", valid: true },
      ],
    });
    render(
      <MemoryRouter><RecentLookups /></MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText("Active")).toBeInTheDocument();
    });
  });
});
