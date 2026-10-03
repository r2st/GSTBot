import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { track } from "./track";

describe("track", () => {
  let originalUmami;

  beforeEach(() => {
    originalUmami = window.umami;
  });

  afterEach(() => {
    if (originalUmami === undefined) {
      delete window.umami;
    } else {
      window.umami = originalUmami;
    }
  });

  it("calls umami.track when umami is available", () => {
    window.umami = { track: vi.fn() };

    track("test_event", { key: "value" });

    expect(window.umami.track).toHaveBeenCalledWith("test_event", { key: "value" });
  });

  it("does nothing when umami is not available", () => {
    delete window.umami;

    expect(() => track("test_event")).not.toThrow();
  });

  it("passes event name without data", () => {
    window.umami = { track: vi.fn() };

    track("simple_event");

    expect(window.umami.track).toHaveBeenCalledWith("simple_event", undefined);
  });
});
