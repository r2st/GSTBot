import { render, screen, act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import BusinessCounter, { getMonthlyCount } from "./BusinessCounter";

describe("getMonthlyCount", () => {
  it("returns a number above 1000", () => {
    const count = getMonthlyCount();
    expect(count).toBeGreaterThan(1000);
  });

  it("is deterministic within a day", () => {
    expect(getMonthlyCount()).toBe(getMonthlyCount());
  });
});

describe("BusinessCounter", () => {
  it("renders the usage text", () => {
    vi.useFakeTimers();
    render(<BusinessCounter />);
    act(() => { vi.advanceTimersByTime(2000); });
    expect(screen.getByText(/businesses this month/)).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("renders the free badge", () => {
    vi.useFakeTimers();
    render(<BusinessCounter />);
    act(() => { vi.advanceTimersByTime(2000); });
    expect(screen.getByText(/Free/)).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("has the role status for accessibility", () => {
    render(<BusinessCounter />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("animates the counter upward", () => {
    vi.useFakeTimers();
    render(<BusinessCounter />);
    const el = screen.getByRole("status");
    const initialText = el.textContent;
    act(() => { vi.advanceTimersByTime(500); });
    const laterText = el.textContent;
    expect(laterText).not.toBe(initialText);
    vi.useRealTimers();
  });
});
