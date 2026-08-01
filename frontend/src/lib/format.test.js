import { describe, expect, it } from "vitest";
import {
  currentPeriod,
  dateLabel,
  daysUntil,
  periodLabel,
  rupees,
  rupeesShort,
  statusLabel,
  statusTone,
} from "./format";

describe("rupees", () => {
  it("uses the Indian digit grouping", () => {
    // 1,23,456 rather than 123,456 — this is what an Indian business reads.
    expect(rupees("123456.78")).toContain("1,23,456.78");
  });

  it("formats a string without going through a float", () => {
    expect(rupees("531000.00")).toContain("5,31,000.00");
  });

  it("falls back to zero on junk", () => {
    expect(rupees(null)).toContain("0.00");
    expect(rupees("not a number")).toContain("0.00");
  });
});

describe("rupeesShort", () => {
  it("uses lakh and crore", () => {
    expect(rupeesShort(12300000)).toBe("₹1.23Cr");
    expect(rupeesShort(531000)).toBe("₹5.31L");
    expect(rupeesShort(5310)).toBe("₹5.3K");
    expect(rupeesShort(531)).toBe("₹531");
  });

  it("handles zero and junk", () => {
    expect(rupeesShort(0)).toBe("₹0");
    expect(rupeesShort(undefined)).toBe("₹0");
  });
});

describe("periodLabel", () => {
  it("expands a filing period", () => {
    expect(periodLabel("2026-04")).toBe("April 2026");
  });

  it("passes anything that is not a period straight through", () => {
    expect(periodLabel("garbage")).toBe("garbage");
    expect(periodLabel(null)).toBe("");
  });
});

describe("dateLabel", () => {
  it("formats an ISO date", () => {
    expect(dateLabel("2026-04-15")).toBe("15 Apr 2026");
  });

  it("shows a dash for nothing", () => {
    expect(dateLabel(null)).toBe("—");
  });
});

describe("currentPeriod", () => {
  it("zero-pads the month", () => {
    expect(currentPeriod(new Date(2026, 0, 15))).toBe("2026-01");
    expect(currentPeriod(new Date(2026, 11, 1))).toBe("2026-12");
  });
});

describe("daysUntil", () => {
  const now = new Date(2026, 4, 15); // 15 May 2026

  it("counts forward to a due date", () => {
    expect(daysUntil("2026-05-20", now)).toBe(5);
  });

  it("goes negative once the deadline has passed", () => {
    expect(daysUntil("2026-05-10", now)).toBe(-5);
  });

  it("is zero on the day itself", () => {
    expect(daysUntil("2026-05-15", now)).toBe(0);
  });

  it("returns null when there is no date", () => {
    expect(daysUntil(null)).toBeNull();
  });
});

describe("status helpers", () => {
  it("labels every status the API can return", () => {
    expect(statusLabel("missing_in_2b")).toBe("Missing in 2B");
    expect(statusLabel("parsed")).toBe("Parsed");
  });

  it("maps a status to a tone", () => {
    expect(statusTone("matched")).toBe("good");
    expect(statusTone("mismatched")).toBe("warn");
    expect(statusTone("failed")).toBe("bad");
    expect(statusTone("uploaded")).toBe("neutral");
  });
});
