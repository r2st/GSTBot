import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import Breadcrumb from "./Breadcrumb";

function renderAt(path, props = {}) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Breadcrumb {...props} />
    </MemoryRouter>,
  );
}

describe("Breadcrumb", () => {
  it("renders Home and current page for a known route", () => {
    renderAt("/calculator");

    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.getByText("GST Calculator")).toBeInTheDocument();
  });

  it("links Home to the root", () => {
    renderAt("/calculator");

    const link = screen.getByText("Home").closest("a");
    expect(link).toHaveAttribute("href", "/");
  });

  it("does not link the current page", () => {
    renderAt("/calculator");

    const current = screen.getByText("GST Calculator");
    expect(current.closest("a")).toBeNull();
    expect(current).toHaveAttribute("aria-current", "page");
  });

  it("renders nothing when there is only one crumb", () => {
    renderAt("/unknown-route");

    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("accepts custom items", () => {
    renderAt("/any", {
      items: [
        { label: "Home", to: "/" },
        { label: "Blog", to: "/blog" },
        { label: "Article" },
      ],
    });

    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.getByText("Blog")).toBeInTheDocument();
    expect(screen.getByText("Article")).toBeInTheDocument();
    expect(screen.getByText("Article").closest("a")).toBeNull();
  });

  it("has an accessible navigation label", () => {
    renderAt("/calculator");

    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toBeInTheDocument();
  });

  it("renders separators between items", () => {
    renderAt("/calculator");

    const seps = screen.getAllByText("/");
    expect(seps.length).toBeGreaterThan(0);
    expect(seps[0]).toHaveAttribute("aria-hidden", "true");
  });
});
