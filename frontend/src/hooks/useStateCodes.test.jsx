import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StateCodesProvider, useStateCodes } from "./useStateCodes";

function jsonResponse(body, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "",
    text: async () => JSON.stringify(body),
  };
}

/** Renders whatever the hook returns, so a test can read it off the DOM. */
function Consumer({ label = "codes" }) {
  const codes = useStateCodes();
  return <p>{`${label}: ${codes ? Object.entries(codes).map(([k, v]) => `${k}=${v}`).join(",") : "none"}`}</p>;
}

describe("useStateCodes", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => vi.restoreAllMocks());

  it("hands a consumer the list the server holds", async () => {
    global.fetch.mockResolvedValueOnce(jsonResponse({ "07": "Delhi", 27: "Maharashtra" }));
    render(
      <StateCodesProvider>
        <Consumer />
      </StateCodesProvider>,
    );

    // In the order the object gives them up, which is not the order they were
    // written: "27" is an array-index-shaped key and jumps ahead of "07", which
    // is not one. Consumers that show the codes have to sort them themselves.
    expect(await screen.findByText("codes: 27=Maharashtra,07=Delhi")).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch.mock.calls[0][0]).toContain("/meta/states");
  });

  it("asks for nothing until a screen wants the codes", async () => {
    // The provider is above the router, so it mounts on the login screen too.
    // An eager fetch there would spend a signed-out visitor's rate-limit bucket
    // on a list only the invoice form ever shows.
    render(
      <StateCodesProvider>
        <p>a screen that never asks</p>
      </StateCodesProvider>,
    );

    await screen.findByText("a screen that never asks");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("asks once however many screens want the codes", async () => {
    global.fetch.mockResolvedValueOnce(jsonResponse({ 27: "Maharashtra" }));
    render(
      <StateCodesProvider>
        <Consumer label="one" />
        <Consumer label="two" />
      </StateCodesProvider>,
    );

    expect(await screen.findByText("one: 27=Maharashtra")).toBeInTheDocument();
    expect(screen.getByText("two: 27=Maharashtra")).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("reports no list rather than an error when the lookup is unreachable", async () => {
    // `/meta/states` is public and metered by address, so an offline browser or
    // a shared office IP that has exhausted the bucket is a real way to arrive
    // here. Every consumer has a way to work without the list; none of them has
    // anything to tell the user about a request they did not make.
    global.fetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(
      <StateCodesProvider>
        <Consumer />
      </StateCodesProvider>,
    );

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    expect(screen.getByText("codes: none")).toBeInTheDocument();
  });

  it("does not ask again after the lookup failed", async () => {
    // The failure is settled, not retried: a consumer that remounts on every
    // navigation would otherwise re-request a list the session has already
    // decided it cannot have.
    global.fetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const { rerender } = render(
      <StateCodesProvider>
        <Consumer />
      </StateCodesProvider>,
    );
    await waitFor(() => expect(screen.getByText("codes: none")).toBeInTheDocument());

    rerender(
      <StateCodesProvider>
        <Consumer label="again" />
      </StateCodesProvider>,
    );

    expect(await screen.findByText("again: none")).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("treats an empty list as no list", async () => {
    // A dropdown whose only option is blank is worse than the text box it
    // replaced — there would be no way to enter a place of supply at all.
    global.fetch.mockResolvedValueOnce(jsonResponse({}));
    render(
      <StateCodesProvider>
        <Consumer />
      </StateCodesProvider>,
    );

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    expect(screen.getByText("codes: none")).toBeInTheDocument();
  });

  it("works with no provider above it, so a page renders on its own", () => {
    // Same contract as usePageTitle: a page dropped into a test, or mounted
    // outside the app shell, degrades to the text box rather than throwing.
    render(<Consumer />);

    expect(screen.getByText("codes: none")).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
