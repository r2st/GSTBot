import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import DeadlineCountdown, { getUpcomingDeadlines } from "./DeadlineCountdown";

describe("getUpcomingDeadlines", () => {
  it("returns two deadline entries", () => {
    const deadlines = getUpcomingDeadlines();
    expect(deadlines).toHaveLength(2);
  });

  it("each deadline has returnType, date, days, hours, urgent", () => {
    const [first] = getUpcomingDeadlines();
    expect(first.returnType).toMatch(/GSTR-/);
    expect(first.date).toBeInstanceOf(Date);
    expect(typeof first.days).toBe("number");
    expect(typeof first.hours).toBe("number");
    expect(typeof first.urgent).toBe("boolean");
  });

  it("deadlines are sorted by date ascending", () => {
    const deadlines = getUpcomingDeadlines();
    expect(deadlines[0].date.getTime()).toBeLessThanOrEqual(deadlines[1].date.getTime());
  });

  it("all deadlines are in the future", () => {
    const now = new Date();
    for (const d of getUpcomingDeadlines()) {
      expect(d.date.getTime()).toBeGreaterThan(now.getTime());
    }
  });

  it("marks deadlines within 3 days as urgent", () => {
    for (const d of getUpcomingDeadlines()) {
      if (d.days <= 3) {
        expect(d.urgent).toBe(true);
      } else {
        expect(d.urgent).toBe(false);
      }
    }
  });
});

describe("DeadlineCountdown", () => {
  it("renders the section heading", () => {
    render(
      <MemoryRouter>
        <DeadlineCountdown />
      </MemoryRouter>,
    );
    expect(screen.getByText("GST Filing Deadline Countdown")).toBeInTheDocument();
  });

  it("renders GSTR-1 and GSTR-3B cards", () => {
    render(
      <MemoryRouter>
        <DeadlineCountdown />
      </MemoryRouter>,
    );
    expect(screen.getByText("GSTR-1")).toBeInTheDocument();
    expect(screen.getByText("GSTR-3B")).toBeInTheDocument();
  });

  it("renders a link to full calendar", () => {
    render(
      <MemoryRouter>
        <DeadlineCountdown />
      </MemoryRouter>,
    );
    expect(screen.getByText(/View Full Calendar/)).toBeInTheDocument();
  });

  it("shows day counts as numbers", () => {
    render(
      <MemoryRouter>
        <DeadlineCountdown />
      </MemoryRouter>,
    );
    const nums = screen.getAllByText(/days?$/);
    expect(nums.length).toBeGreaterThanOrEqual(2);
  });
});
