import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import TableScroll from "./TableScroll";

function Table() {
  return (
    <table>
      <tbody>
        <tr>
          <td>A cell</td>
        </tr>
      </tbody>
    </table>
  );
}

describe("TableScroll", () => {
  it("renders the table it wraps", () => {
    render(
      <TableScroll label="Invoices">
        <Table />
      </TableScroll>,
    );
    expect(screen.getByText("A cell")).toBeInTheDocument();
  });

  it("is a named region rather than an anonymous div", () => {
    render(
      <TableScroll label="Reconciliation findings">
        <Table />
      </TableScroll>,
    );
    // An unlabelled region is not exposed as one at all, so the name is what
    // makes the tab stop worth landing on.
    expect(screen.getByRole("region", { name: "Reconciliation findings" })).toBeInTheDocument();
  });

  it("can be focused from the keyboard", async () => {
    const user = userEvent.setup();
    render(
      <TableScroll label="Invoices">
        <Table />
      </TableScroll>,
    );

    // This is the whole point. `overflow-x: auto` with nothing focusable inside
    // means Tab walks straight past the columns that are scrolled out of view,
    // and no key press will bring them back — WCAG 2.1.1. The tab stop is what
    // lets the arrow keys scroll it.
    await user.tab();
    expect(screen.getByRole("region", { name: "Invoices" })).toHaveFocus();
  });

  it("keeps the scroll class the stylesheet hangs the overflow on", () => {
    render(
      <TableScroll label="Suppliers">
        <Table />
      </TableScroll>,
    );
    expect(screen.getByRole("region", { name: "Suppliers" })).toHaveClass("table-scroll");
  });
});
