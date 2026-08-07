import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AlertsPage from "./AlertsPage";

function alert(overrides = {}) {
  return {
    id: 1,
    alert_type: "filing_deadline",
    severity: "critical",
    status: "pending",
    title: "GSTR-3B for 2026-04 is overdue",
    message:
      "GSTR-3B for 2026-04 was due on 2026-05-20 and has not been recorded as filed.",
    period: "2026-04",
    due_date: "2026-05-20",
    channel: null,
    sent_at: null,
    context: { return_type: "gstr3b" },
    created_at: "2026-05-21T04:00:00Z",
    updated_at: "2026-05-21T04:00:00Z",
    ...overrides,
  };
}

function page(items, overrides = {}) {
  return {
    items,
    total: items.length,
    open_total: items.filter((a) =>
      ["pending", "sent", "read", "failed"].includes(a.status),
    ).length,
    limit: 50,
    offset: 0,
    ...overrides,
  };
}

/** Answer each call in order, so an action's response differs from the list. */
function mockFetch(...bodies) {
  const fetch = vi.fn();
  bodies.forEach((body) => {
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "",
      text: async () => JSON.stringify(body),
    });
  });
  global.fetch = fetch;
  return fetch;
}

function renderPage() {
  return render(
    <MemoryRouter>
      <AlertsPage />
    </MemoryRouter>,
  );
}

describe("AlertsPage", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("shows what each alert says", async () => {
    mockFetch(page([alert()]));
    renderPage();

    expect(await screen.findByText(/GSTR-3B for 2026-04 is overdue/)).toBeInTheDocument();
    expect(screen.getByText(/has not been recorded as filed/)).toBeInTheDocument();
  });

  it("asks for open alerts by default", async () => {
    const fetch = mockFetch(page([alert()]));
    renderPage();

    await screen.findByText(/is overdue/);
    expect(fetch.mock.calls[0][0]).toContain("scope=open");
  });

  it("labels an overdue return more loudly than an upcoming one", async () => {
    mockFetch(page([alert({ severity: "info", title: "GSTR-1 for 2026-05 is due in 5 days" })]));
    renderPage();

    expect(await screen.findByText("Upcoming")).toBeInTheDocument();
  });

  it("dismisses an alert and takes it off the open list", async () => {
    // The sweep's central rule is that a dismissal is respected and the alert
    // is not raised again tomorrow. Until this page existed no client could
    // produce one, so the rule could never fire and a business that filed on
    // the portal without recording it here was told it was late every morning
    // with no way to stop it.
    mockFetch(page([alert()]), alert({ status: "dismissed" }));
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: "Dismiss" }));

    await waitFor(() =>
      expect(screen.queryByText(/GSTR-3B for 2026-04 is overdue/)).not.toBeInTheDocument(),
    );
  });

  it("posts the dismissal to the alert it was clicked on", async () => {
    const fetch = mockFetch(
      page([alert({ id: 7 })]),
      alert({ id: 7, status: "dismissed" }),
    );
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: "Dismiss" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(fetch.mock.calls[1][0]).toContain("/alerts/7/dismiss");
    expect(fetch.mock.calls[1][1].method).toBe("POST");
  });

  it("keeps a read alert on the open list", async () => {
    // Seen is not handled. A filing deadline someone has looked at is exactly
    // as unmet as one they have not, so reading it must not clear the badge —
    // which is the bug the backend's OPEN_STATUSES already exists to prevent.
    mockFetch(page([alert()]), alert({ status: "read" }));
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: "Mark as read" }));

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Mark as read" })).not.toBeInTheDocument(),
    );
    expect(screen.getByText(/GSTR-3B for 2026-04 is overdue/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
  });

  it("takes the new status from the server rather than assuming it", async () => {
    // Dismissing an alert the sweep already resolved leaves it resolved: it
    // closed because the return was filed, and recording that as a dismissal
    // would lose the difference between an alert that worked and one that was
    // swatted away.
    mockFetch(
      page([alert({ status: "read" })], { open_total: 1 }),
      alert({ status: "resolved" }),
    );
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: "Dismiss" }));

    // Gone from the open list, and never described as dismissed on the way out.
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Dismiss" })).not.toBeInTheDocument(),
    );
    expect(screen.queryByText("Dismissed")).not.toBeInTheDocument();
  });

  it("distinguishes a filed return from a swatted reminder under closed", async () => {
    const fetch = mockFetch(
      page([
        alert({ id: 1, status: "resolved", title: "GSTR-1 for 2026-03 is overdue" }),
        alert({ id: 2, status: "dismissed", title: "GSTR-3B for 2026-03 is overdue" }),
      ]),
      page([
        alert({ id: 1, status: "resolved", title: "GSTR-1 for 2026-03 is overdue" }),
        alert({ id: 2, status: "dismissed", title: "GSTR-3B for 2026-03 is overdue" }),
      ]),
    );
    renderPage();

    await screen.findByText(/GSTR-1 for 2026-03/);
    await userEvent.click(screen.getByRole("button", { name: "Closed" }));

    await waitFor(() => expect(fetch.mock.calls[1][0]).toContain("scope=closed"));
    expect(await screen.findByText("Filed")).toBeInTheDocument();
    expect(screen.getByText("Dismissed")).toBeInTheDocument();
  });

  it("offers no actions on an alert that is already closed", async () => {
    mockFetch(page([alert({ status: "resolved" })]));
    renderPage();

    await screen.findByText(/is overdue/);
    expect(screen.queryByRole("button", { name: "Dismiss" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark as read" })).not.toBeInTheDocument();
  });

  it("points a deadline alert at the screen that closes it properly", async () => {
    // Recording the filing is what resolves the alert; dismissing only
    // silences it. The route to the former should not be something to go and
    // find.
    mockFetch(page([alert()]));
    renderPage();

    expect(await screen.findByRole("link", { name: /Record filing/ })).toHaveAttribute(
      "href",
      "/filing",
    );
  });

  it("says the list is empty rather than showing nothing", async () => {
    mockFetch(page([]));
    renderPage();
    expect(await screen.findByText(/Nothing outstanding/)).toBeInTheDocument();
  });

  it("reports a failure to load instead of looking empty", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "",
      text: async () => JSON.stringify({ detail: "Database unreachable" }),
    });
    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent(/Database unreachable/);
  });

  it("leaves the row alone when the action fails", async () => {
    const fetch = vi.fn();
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "",
      text: async () => JSON.stringify(page([alert()])),
    });
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "",
      text: async () => JSON.stringify({ detail: "Could not save" }),
    });
    global.fetch = fetch;
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: "Dismiss" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/Could not save/);
    // Still there, still dismissible — an optimistic removal would have hidden
    // an alert the server still considers open. Scoped to the row, because the
    // error banner has a Dismiss button of its own.
    const row = screen.getByRole("listitem");
    expect(within(row).getByText(/GSTR-3B for 2026-04 is overdue/)).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Dismiss" })).toBeEnabled();
  });

  it("only disables the row being acted on", async () => {
    // Clearing a backlog is one row at a time, so a page-wide busy flag would
    // make every other alert unclickable while one request is in flight.
    let release;
    const fetch = vi.fn();
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "",
      text: async () => JSON.stringify(page([alert({ id: 1 }), alert({ id: 2 })])),
    });
    fetch.mockReturnValueOnce(new Promise((resolve) => (release = resolve)));
    global.fetch = fetch;
    renderPage();

    const rows = await screen.findAllByRole("listitem");
    await userEvent.click(within(rows[0]).getByRole("button", { name: "Dismiss" }));

    expect(within(rows[0]).getByRole("button", { name: "Dismiss" })).toBeDisabled();
    expect(within(rows[1]).getByRole("button", { name: "Dismiss" })).toBeEnabled();

    release({
      ok: true,
      status: 200,
      statusText: "",
      text: async () => JSON.stringify(alert({ id: 1, status: "dismissed" })),
    });
  });

  it("counts the open alerts on the tab", async () => {
    mockFetch(page([alert({ id: 1 }), alert({ id: 2 })]));
    renderPage();
    expect(await screen.findByRole("button", { name: /Open \(2\)/ })).toBeInTheDocument();
  });
});
