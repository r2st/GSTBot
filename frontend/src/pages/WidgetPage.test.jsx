import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import WidgetPage, { parseWidgetParams } from "./WidgetPage";

const mockTrack = vi.fn();
vi.mock("../lib/track", () => ({ track: (...args) => mockTrack(...args) }));

function renderWidget(search = "") {
  return render(
    <MemoryRouter initialEntries={[`/widget${search}`]}>
      <WidgetPage />
    </MemoryRouter>,
  );
}

describe("WidgetPage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("renders the calculator heading", () => {
    renderWidget();
    expect(screen.getByText("GST Calculator")).toBeInTheDocument();
  });

  it("renders the powered-by link", () => {
    renderWidget();
    const link = screen.getByText(/Powered by/);
    expect(link).toBeInTheDocument();
    expect(link.closest("a")).toHaveAttribute("href", "https://gst.doaide.com?ref=widget");
    expect(link.closest("a")).toHaveAttribute("target", "_blank");
  });

  it("calculates GST when an amount is entered", async () => {
    renderWidget();
    const input = screen.getByPlaceholderText("Enter amount in ₹");
    await userEvent.type(input, "1000");
    expect(screen.getByText("₹1,180.00")).toBeInTheDocument();
  });

  it("defaults to 18% rate", () => {
    renderWidget();
    const select = screen.getByDisplayValue("18%");
    expect(select).toBeInTheDocument();
  });

  it("respects rate URL parameter", () => {
    renderWidget("?rate=5");
    const select = screen.getByDisplayValue("5%");
    expect(select).toBeInTheDocument();
  });

  it("fires widget_calculate tracking event", async () => {
    renderWidget();
    const input = screen.getByPlaceholderText("Enter amount in ₹");
    await userEvent.type(input, "500");
    expect(mockTrack).toHaveBeenCalledWith("widget_calculate", expect.objectContaining({ rate: 18 }));
  });

  it("toggles between exclusive and inclusive modes", async () => {
    renderWidget();
    await userEvent.type(screen.getByPlaceholderText("Enter amount in ₹"), "1180");
    await userEvent.click(screen.getByText("Inclusive"));
    expect(screen.getByText("₹1,000.00")).toBeInTheDocument();
  });

  it("supports interstate toggle", async () => {
    renderWidget();
    await userEvent.type(screen.getByPlaceholderText("Enter amount in ₹"), "1000");
    await userEvent.click(screen.getByText(/Interstate/));
    expect(screen.getByText(/IGST \(18%\)/)).toBeInTheDocument();
  });
});

describe("parseWidgetParams", () => {
  it("returns defaults for empty params", () => {
    const result = parseWidgetParams(new URLSearchParams());
    expect(result).toEqual({ theme: null, rate: 18, width: null });
  });

  it("parses theme=light", () => {
    const result = parseWidgetParams(new URLSearchParams("theme=light"));
    expect(result.theme).toBe("light");
  });

  it("ignores invalid theme", () => {
    const result = parseWidgetParams(new URLSearchParams("theme=purple"));
    expect(result.theme).toBeNull();
  });

  it("parses valid rate", () => {
    const result = parseWidgetParams(new URLSearchParams("rate=12"));
    expect(result.rate).toBe(12);
  });

  it("falls back to 18 for invalid rate", () => {
    const result = parseWidgetParams(new URLSearchParams("rate=abc"));
    expect(result.rate).toBe(18);
  });

  it("parses width", () => {
    const result = parseWidgetParams(new URLSearchParams("width=400"));
    expect(result.width).toBe(400);
  });
});
