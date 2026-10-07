import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import Gstr9ChecklistPage from "./Gstr9ChecklistPage";

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/gstr9-checklist"]}>
      <Gstr9ChecklistPage />
    </MemoryRouter>,
  );
}

describe("Gstr9ChecklistPage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders the title and all sections", () => {
    renderPage();
    expect(screen.getByText("GSTR-9 Annual Return Checklist")).toBeInTheDocument();
    expect(screen.getByText("Part I — Basic Details")).toBeInTheDocument();
    expect(screen.getByText("Part III — Input Tax Credit")).toBeInTheDocument();
    expect(screen.getByText("Pre-Filing Verification")).toBeInTheDocument();
  });

  it("shows progress counter starting at 0", () => {
    renderPage();
    expect(screen.getByText(/0 \/ \d+ completed/)).toBeInTheDocument();
  });

  it("checking an item updates progress", async () => {
    renderPage();
    const user = userEvent.setup();
    const checkboxes = screen.getAllByRole("checkbox");
    await user.click(checkboxes[0]);
    expect(screen.getByText(/1 \/ \d+ completed/)).toBeInTheDocument();
  });

  it("persists checked state in localStorage", async () => {
    renderPage();
    const user = userEvent.setup();
    const checkboxes = screen.getAllByRole("checkbox");
    await user.click(checkboxes[0]);
    const stored = JSON.parse(localStorage.getItem("gstr9-checklist"));
    expect(stored["1a"]).toBe(true);
  });

  it("reset button clears all checks", async () => {
    renderPage();
    const user = userEvent.setup();
    const checkboxes = screen.getAllByRole("checkbox");
    await user.click(checkboxes[0]);
    await user.click(checkboxes[1]);
    expect(screen.getByText(/2 \/ \d+ completed/)).toBeInTheDocument();

    await user.click(screen.getByText("Reset All"));
    expect(screen.getByText(/0 \/ \d+ completed/)).toBeInTheDocument();
  });

  it("renders about section", () => {
    renderPage();
    expect(screen.getByText("About GSTR-9 Annual Return")).toBeInTheDocument();
  });
});
