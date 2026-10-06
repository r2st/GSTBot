import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import PrintButton from "./PrintButton";

const mockTrack = vi.fn();
vi.mock("../lib/track", () => ({ track: (...args) => mockTrack(...args) }));

describe("PrintButton", () => {
  it("renders with default label", () => {
    render(<PrintButton />);
    expect(screen.getByRole("button", { name: "Print" })).toBeInTheDocument();
  });

  it("renders with custom label", () => {
    render(<PrintButton label="Print Result" />);
    expect(screen.getByRole("button", { name: "Print Result" })).toBeInTheDocument();
  });

  it("calls window.print and tracks on click", async () => {
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});
    render(<PrintButton label="Print" />);

    await userEvent.click(screen.getByRole("button", { name: "Print" }));

    expect(printSpy).toHaveBeenCalledOnce();
    expect(mockTrack).toHaveBeenCalledWith("print");
    printSpy.mockRestore();
  });
});
