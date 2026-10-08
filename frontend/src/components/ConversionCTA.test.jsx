import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InlineCTA, StickyMobileCTA } from "./ConversionCTA";

// Mock useAuth — default: no user (logged out)
const mockUser = { current: null };
vi.mock("../hooks/useAuth", () => ({
  useAuth: () => ({ user: mockUser.current, loading: false }),
}));

vi.mock("../lib/track", () => ({
  track: vi.fn(),
}));

function renderInline(variant) {
  return render(
    <MemoryRouter>
      <InlineCTA variant={variant} />
    </MemoryRouter>,
  );
}

describe("InlineCTA", () => {
  beforeEach(() => {
    mockUser.current = null;
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("renders the save variant by default", () => {
    renderInline("save");

    expect(screen.getByText("Save your calculations")).toBeInTheDocument();
    expect(screen.getByText("Create Free Account")).toBeInTheDocument();
  });

  it("renders the remind variant", () => {
    renderInline("remind");

    expect(screen.getByText("Never miss a GST deadline")).toBeInTheDocument();
    expect(screen.getByText("Get Filing Reminders")).toBeInTheDocument();
  });

  it("renders the invoice variant", () => {
    renderInline("invoice");

    expect(screen.getByText("Automate your GST filing")).toBeInTheDocument();
    expect(screen.getByText("Start Free")).toBeInTheDocument();
  });

  it("renders nothing when user is logged in", () => {
    mockUser.current = { id: 1, email: "test@example.com" };
    const { container } = renderInline("save");

    expect(container.innerHTML).toBe("");
  });

  it("dismisses when Not now is clicked", () => {
    renderInline("save");

    expect(screen.getByText("Save your calculations")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Not now"));
    expect(screen.queryByText("Save your calculations")).not.toBeInTheDocument();
  });

  it("falls back to save when variant is unknown", () => {
    renderInline("unknown");

    expect(screen.getByText("Save your calculations")).toBeInTheDocument();
  });
});

describe("StickyMobileCTA", () => {
  beforeEach(() => {
    mockUser.current = null;
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("renders nothing initially (requires scroll)", () => {
    const { container } = render(
      <MemoryRouter>
        <StickyMobileCTA />
      </MemoryRouter>,
    );

    // Before scroll, not visible
    expect(container.querySelector(".sticky-mobile-cta")).toBeNull();
  });

  it("renders nothing when user is logged in", () => {
    mockUser.current = { id: 1, email: "test@example.com" };
    const { container } = render(
      <MemoryRouter>
        <StickyMobileCTA />
      </MemoryRouter>,
    );

    expect(container.querySelector(".sticky-mobile-cta")).toBeNull();
  });
});
