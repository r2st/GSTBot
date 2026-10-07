import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import DoAideFooter from "./DoAideFooter";

describe("DoAideFooter", () => {
  it("renders the heading", () => {
    render(<DoAideFooter />);
    expect(screen.getByText("More free tools from DoAide")).toBeInTheDocument();
  });

  it("renders all five DoAide tools", () => {
    render(<DoAideFooter />);
    expect(screen.getByText("Invoicer")).toBeInTheDocument();
    expect(screen.getByText("Contracts")).toBeInTheDocument();
    expect(screen.getByText("Comply")).toBeInTheDocument();
    expect(screen.getByText("Salary")).toBeInTheDocument();
    expect(screen.getByText("Calculator")).toBeInTheDocument();
  });

  it("links to the correct domains", () => {
    render(<DoAideFooter />);
    expect(screen.getByText("Invoicer").closest("a")).toHaveAttribute(
      "href",
      "https://invoicer.doaide.com",
    );
    expect(screen.getByText("Contracts").closest("a")).toHaveAttribute(
      "href",
      "https://contracts.doaide.com",
    );
    expect(screen.getByText("Comply").closest("a")).toHaveAttribute(
      "href",
      "https://comply.doaide.com",
    );
    expect(screen.getByText("Salary").closest("a")).toHaveAttribute(
      "href",
      "https://salary.doaide.com",
    );
    expect(screen.getByText("Calculator").closest("a")).toHaveAttribute(
      "href",
      "https://fincalc.doaide.com",
    );
  });

  it("opens links in new tabs", () => {
    render(<DoAideFooter />);
    const links = screen.getAllByRole("link");
    links.forEach((link) => {
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    });
  });

  it("has the correct aria label", () => {
    render(<DoAideFooter />);
    expect(screen.getByRole("contentinfo", { name: "More free tools from DoAide" })).toBeInTheDocument();
  });

  it("shows descriptions for each tool", () => {
    render(<DoAideFooter />);
    expect(screen.getByText("Create GST invoices in seconds")).toBeInTheDocument();
    expect(screen.getByText("Draft & manage business contracts")).toBeInTheDocument();
    expect(screen.getByText("Track all compliance deadlines")).toBeInTheDocument();
    expect(screen.getByText("Payroll & salary slip generation")).toBeInTheDocument();
    expect(screen.getByText("Financial calculators & tools")).toBeInTheDocument();
  });
});
