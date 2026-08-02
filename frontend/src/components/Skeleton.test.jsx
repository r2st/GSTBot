import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  SkeletonPanel,
  SkeletonStats,
  SkeletonTable,
  SkeletonText,
  Spinner,
} from "./Skeleton";

describe("Skeleton", () => {
  it("announces what is loading rather than reading out nothing", () => {
    render(<SkeletonText label="Loading invoices" />);
    expect(screen.getByText("Loading invoices…")).toBeInTheDocument();
  });

  it("marks the region busy and polite", () => {
    const { container } = render(<SkeletonText />);
    const region = container.firstChild;
    expect(region).toHaveAttribute("aria-busy", "true");
    expect(region).toHaveAttribute("aria-live", "polite");
  });

  it("does not claim role=status", () => {
    // The pages use a status region for things the user must act on — "this
    // period has not been reconciled". A placeholder claiming the same role
    // competes with it, both for a screen reader and for a test looking the
    // banner up by role.
    render(<SkeletonText />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("hides the decorative bars from assistive tech", () => {
    const { container } = render(<SkeletonText lines={3} />);
    // The bars carry no information; announcing three empty divs is noise.
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
    expect(container.querySelectorAll(".skeleton-line")).toHaveLength(3);
  });

  it("renders the number of lines asked for", () => {
    const { container } = render(<SkeletonText lines={7} />);
    expect(container.querySelectorAll(".skeleton-line")).toHaveLength(7);
  });

  it("shapes the stat placeholder like the cards it stands in for", () => {
    // Four cards appearing at once used to push the whole dashboard down.
    const { container } = render(<SkeletonStats count={4} />);
    expect(container.querySelectorAll(".stat-card")).toHaveLength(4);
  });

  it("builds a table placeholder of the right dimensions", () => {
    const { container } = render(<SkeletonTable rows={5} columns={4} />);
    const rows = container.querySelectorAll(".skeleton-row");
    expect(rows).toHaveLength(5);
    expect(rows[0].querySelectorAll(".skeleton-cell")).toHaveLength(4);
  });

  it("passes the column count to CSS so the grid matches", () => {
    const { container } = render(<SkeletonTable rows={1} columns={6} />);
    expect(container.querySelector(".skeleton-row")).toHaveStyle({ "--cols": "6" });
  });

  it("renders a panel placeholder with a label", () => {
    render(<SkeletonPanel lines={4} label="Checking your session" />);
    expect(screen.getByText("Checking your session…")).toBeInTheDocument();
  });

  it("gives the spinner an accessible label", () => {
    render(<Spinner label="Extracting" />);
    // Otherwise a button in flight reads as an unlabelled empty span.
    expect(screen.getByText("Extracting…")).toBeInTheDocument();
  });
});
