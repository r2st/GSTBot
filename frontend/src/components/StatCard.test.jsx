import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import StatCard from "./StatCard";

describe("StatCard", () => {
  it("shows the label and the figure", () => {
    render(<StatCard label="Invoices this month" value="128" />);
    expect(screen.getByText("Invoices this month")).toBeInTheDocument();
    expect(screen.getByText("128")).toBeInTheDocument();
  });

  it("shows the sub-line when there is one", () => {
    render(<StatCard label="Tax at risk" value="₹9,000.00" sub="across 2 suppliers" />);
    expect(screen.getByText("across 2 suppliers")).toBeInTheDocument();
  });

  describe("when there is no sub-line", () => {
    // Not an empty div. The cards sit in one grid row and the stylesheet gives
    // `.stat-sub` its own line, so an empty one on three of four cards makes
    // those three taller than the fourth for no reason the reader can see.
    it("leaves the element out rather than rendering it empty", () => {
      const { container } = render(<StatCard label="Filed" value="4" />);
      expect(container.querySelector(".stat-sub")).toBeNull();
    });

    it("leaves it out for an empty string too", () => {
      // The pages build this line by joining counts, and the join is "" when
      // there is nothing to say. `sub && …` is what makes those two cases the
      // same case rather than one card with an invisible line in it.
      const { container } = render(<StatCard label="Filed" value="4" sub="" />);
      expect(container.querySelector(".stat-sub")).toBeNull();
    });

    it("still renders the figure it was there to caption", () => {
      render(<StatCard label="Filed" value="4" />);
      expect(screen.getByText("4")).toBeInTheDocument();
    });
  });

  describe("the tone", () => {
    // The tone is the card's only colour, and it is read off a threshold by
    // the caller — a negative ITC position is `bad`, a matched period `good`.
    it("carries the tone it was given", () => {
      const { container } = render(<StatCard label="ITC at risk" value="₹1" tone="bad" />);
      expect(container.querySelector(".stat-card")).toHaveClass("tone-bad");
    });

    it("falls back to neutral rather than to no tone at all", () => {
      // `tone-undefined` is a class that matches nothing, so the card would
      // lose its border and background rather than merely its colour — the
      // default is what keeps a caller that passes no tone looking like a card.
      const { container } = render(<StatCard label="Invoices" value="12" />);
      expect(container.querySelector(".stat-card")).toHaveClass("tone-neutral");
    });
  });

  it("renders a value that is a node rather than a string", () => {
    // The dashboard passes a formatted amount beside a chip, not just text.
    render(
      <StatCard
        label="This month"
        value={
          <>
            <span>₹1,80,000.00</span>
            <span>up 4%</span>
          </>
        }
      />,
    );
    expect(screen.getByText("₹1,80,000.00")).toBeInTheDocument();
    expect(screen.getByText("up 4%")).toBeInTheDocument();
  });

  it("shows a zero rather than treating it as nothing to say", () => {
    // `0` is falsy and is the whole point of the card on a quiet month. It
    // goes through `{value}` rather than a `&&`, which is what keeps it on
    // screen — a blank card reads as a failed load.
    render(<StatCard label="Mismatches" value={0} />);
    expect(screen.getByText("0")).toBeInTheDocument();
  });
});
