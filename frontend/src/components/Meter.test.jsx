import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Meter from "./Meter";

describe("Meter", () => {
  it("exposes itself as a progress bar", () => {
    render(<Meter value={30} max={100} label="Invoices used this month" />);
    // Before this the plan usage was a width percentage on a div: the one
    // figure on the dashboard available only to people who could see it.
    expect(
      screen.getByRole("progressbar", { name: "Invoices used this month" }),
    ).toBeInTheDocument();
  });

  it("reports the value and the range", () => {
    render(<Meter value={30} max={100} label="Usage" />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "30");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
    expect(bar).toHaveAttribute("aria-valuetext", "30 of 100");
  });

  it("fills in proportion to the value", () => {
    const { container } = render(<Meter value={25} max={200} label="Usage" />);
    expect(container.querySelector(".meter-fill")).toHaveStyle({ width: "12.5%" });
  });

  describe("when usage is over the limit", () => {
    // Reachable in production: the plan check runs at upload time, so an
    // account moved to a smaller plan is over its limit before it uploads
    // anything at all.
    it("pins the bar at full rather than overflowing the track", () => {
      const { container } = render(<Meter value={140} max={100} label="Usage" />);
      expect(container.querySelector(".meter-fill")).toHaveStyle({ width: "100%" });
    });

    it("marks the fill so the colour can change", () => {
      const { container } = render(<Meter value={140} max={100} label="Usage" />);
      expect(container.querySelector(".meter-fill")).toHaveClass("is-over");
    });

    it("clamps aria-valuenow into the range the spec allows", () => {
      render(<Meter value={140} max={100} label="Usage" />);
      expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
    });

    it("still announces the real numbers", () => {
      // The clamp above is what keeps the markup valid; this is what keeps it
      // honest, and it is the attribute a screen reader actually reads.
      render(<Meter value={140} max={100} label="Usage" />);
      expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuetext", "140 of 100");
    });
  });

  describe("degenerate input", () => {
    it("does not divide by a zero limit", () => {
      const { container } = render(<Meter value={5} max={0} label="Usage" />);
      expect(container.querySelector(".meter-fill")).toHaveStyle({ width: "0%" });
    });

    it("treats a missing value as none used", () => {
      render(<Meter value={undefined} max={100} label="Usage" />);
      expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
    });

    it("does not render a negative fill", () => {
      const { container } = render(<Meter value={-10} max={100} label="Usage" />);
      expect(container.querySelector(".meter-fill")).toHaveStyle({ width: "0%" });
    });

    it("accepts the strings the API sends for decimal fields", () => {
      render(<Meter value="40" max="80" label="Usage" />);
      expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "40");
    });
  });
});
