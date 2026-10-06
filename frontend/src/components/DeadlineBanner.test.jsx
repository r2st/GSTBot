import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DeadlineBanner, { daysUntil, getNextDeadline } from "./DeadlineBanner";

describe("getNextDeadline", () => {
  it("returns a deadline object with returnType and date", () => {
    const deadline = getNextDeadline();
    expect(deadline).not.toBeNull();
    expect(deadline.returnType).toMatch(/GSTR-/);
    expect(deadline.date).toBeInstanceOf(Date);
    expect(deadline.date > new Date()).toBe(true);
  });
});

describe("daysUntil", () => {
  it("returns positive number for future dates", () => {
    const future = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    expect(daysUntil(future)).toBeGreaterThan(0);
  });

  it("returns 1 for tomorrow", () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(12, 0, 0, 0);
    const days = daysUntil(tomorrow);
    expect(days).toBeGreaterThanOrEqual(0);
    expect(days).toBeLessThanOrEqual(2);
  });
});

describe("DeadlineBanner", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("renders the banner with a deadline", () => {
    render(<MemoryRouter><DeadlineBanner /></MemoryRouter>);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText(/GSTR-/)).toBeInTheDocument();
    expect(screen.getByText("View all deadlines")).toBeInTheDocument();
  });

  it("links to the due-dates page", () => {
    render(<MemoryRouter><DeadlineBanner /></MemoryRouter>);
    expect(screen.getByText("View all deadlines").closest("a")).toHaveAttribute("href", "/due-dates");
  });

  it("can be dismissed", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><DeadlineBanner /></MemoryRouter>);
    await user.click(screen.getByLabelText("Dismiss deadline reminder"));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("stays dismissed across renders within expiry period", () => {
    localStorage.setItem("gstbot_deadline_dismissed", String(Date.now()));
    render(<MemoryRouter><DeadlineBanner /></MemoryRouter>);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("comes back after expiry", () => {
    localStorage.setItem("gstbot_deadline_dismissed", String(Date.now() - 25 * 60 * 60 * 1000));
    render(<MemoryRouter><DeadlineBanner /></MemoryRouter>);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});
