import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StickyToolsBanner from "./StickyToolsBanner";

vi.mock("../lib/track", () => ({ track: vi.fn() }));

function renderBanner() {
  return render(
    <MemoryRouter>
      <StickyToolsBanner />
    </MemoryRouter>,
  );
}

describe("StickyToolsBanner", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("renders nothing initially before scroll", () => {
    const { container } = renderBanner();

    expect(container.querySelector(".sticky-tools-banner")).toBeNull();
  });

  it("renders nothing when previously dismissed", () => {
    localStorage.setItem("gstbot_tools_banner_dismissed", String(Date.now()));

    const { container } = renderBanner();

    expect(container.querySelector(".sticky-tools-banner")).toBeNull();
  });

  it("shows after scroll threshold is reached", () => {
    renderBanner();

    Object.defineProperty(window, "scrollY", { value: 500, writable: true });
    fireEvent.scroll(window);

    expect(screen.getByText(/25\+ free GST tools/)).toBeInTheDocument();
    expect(screen.getByText("Explore All Tools")).toBeInTheDocument();
  });

  it("dismisses when the close button is clicked", () => {
    renderBanner();

    Object.defineProperty(window, "scrollY", { value: 500, writable: true });
    fireEvent.scroll(window);

    expect(screen.getByText(/25\+ free GST tools/)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Dismiss banner"));

    expect(screen.queryByText(/25\+ free GST tools/)).not.toBeInTheDocument();
    expect(localStorage.getItem("gstbot_tools_banner_dismissed")).toBeTruthy();
  });

  it("resurfaces after the dismiss window expires", () => {
    const fourDaysAgo = Date.now() - 4 * 24 * 60 * 60 * 1000;
    localStorage.setItem("gstbot_tools_banner_dismissed", String(fourDaysAgo));

    renderBanner();

    Object.defineProperty(window, "scrollY", { value: 500, writable: true });
    fireEvent.scroll(window);

    expect(screen.getByText(/25\+ free GST tools/)).toBeInTheDocument();
  });
});
