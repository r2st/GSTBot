import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import UploadPage from "./UploadPage";

function jsonResponse(body, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "",
    text: async () => JSON.stringify(body),
  };
}

function invoiceResponse(overrides = {}) {
  return {
    queued: false,
    message: "Invoice processed",
    invoice: {
      id: 1,
      invoice_number: "INV-2026-0042",
      counterparty_gstin: "29AAGCB7383J1Z4",
      invoice_date: "2026-04-15",
      total_value: "531000.00",
      // What the API derives and every screen prints: the stored total where
      // there is one, taxable value plus tax where the extractor found no
      // grand-total label to write it from.
      invoice_value: "531000.00",
      warnings: [],
      ...overrides,
    },
  };
}

function file(name = "invoice.txt") {
  return new File(["invoice text"], name, { type: "text/plain" });
}

/** A File reporting a size without allocating the bytes for it. */
function sizedFile(name, bytes) {
  const made = file(name);
  Object.defineProperty(made, "size", { value: bytes });
  return made;
}

function renderPage() {
  return render(
    <MemoryRouter>
      <UploadPage />
    </MemoryRouter>,
  );
}

describe("UploadPage", () => {
  beforeEach(() => {
    localStorage.clear();
    global.fetch = vi.fn();
  });

  afterEach(() => vi.restoreAllMocks());

  it("uploads a file and shows what was extracted", async () => {
    const user = userEvent.setup();
    global.fetch.mockResolvedValueOnce(jsonResponse(invoiceResponse()));

    renderPage();
    await user.upload(screen.getByLabelText("Choose files"), file());

    expect(await screen.findByText("INV-2026-0042")).toBeInTheDocument();
    expect(screen.getByText(/₹5,31,000.00/)).toBeInTheDocument();
  });

  it("defaults to a purchase, since that is what ITC is claimed on", async () => {
    const user = userEvent.setup();
    global.fetch.mockResolvedValueOnce(jsonResponse(invoiceResponse()));

    renderPage();
    expect(screen.getByLabelText("Purchase (claim ITC)")).toBeChecked();

    await user.upload(screen.getByLabelText("Choose files"), file());
    await waitFor(() => {
      expect(global.fetch.mock.calls[0][1].body.get("invoice_type")).toBe("purchase");
    });
  });

  it("sends the chosen type when uploading a sales invoice", async () => {
    const user = userEvent.setup();
    global.fetch.mockResolvedValueOnce(jsonResponse(invoiceResponse()));

    renderPage();
    await user.click(screen.getByLabelText("Sales (feeds GSTR-1)"));
    await user.upload(screen.getByLabelText("Choose files"), file());

    await waitFor(() => {
      expect(global.fetch.mock.calls[0][1].body.get("invoice_type")).toBe("sales");
    });
  });

  it("shows extraction warnings rather than hiding them", async () => {
    const user = userEvent.setup();
    global.fetch.mockResolvedValueOnce(
      jsonResponse(invoiceResponse({ warnings: ["No valid supplier GSTIN found"] })),
    );

    renderPage();
    await user.upload(screen.getByLabelText("Choose files"), file());

    // A flagged invoice can be corrected; a silently-accepted bad one is
    // filed wrong.
    expect(await screen.findByText("No valid supplier GSTIN found")).toBeInTheDocument();
  });

  it("still gives a scan the parser read nothing off a row worth clicking", async () => {
    // The commonest bad-but-not-failed outcome: a photographed invoice the
    // model could not get a number, a GSTIN or a date out of. It is stored,
    // it is claimable once corrected, and the row has to say which file it
    // was and offer the way in — an empty row reads as a dropped upload, and
    // the fix for a dropped upload is to drop it again, which duplicates it.
    const user = userEvent.setup();
    global.fetch.mockResolvedValueOnce(
      jsonResponse({
        queued: false,
        message: "Invoice processed",
        invoice: { id: 12, invoice_value: "0.00" },
      }),
    );

    renderPage();
    await user.upload(screen.getByLabelText("Choose files"), file("photo.txt"));

    expect(await screen.findByText("photo.txt")).toBeInTheDocument();
    expect(screen.getByText(/No number found/)).toBeInTheDocument();
    // No stray separators for the fields that are not there.
    expect(screen.getByText(/No number found/).textContent).toBe("No number found · ₹0.00");
    expect(screen.getByRole("link", { name: "Review" })).toHaveAttribute(
      "href",
      "/invoices/12",
    );
  });

  it("reports a per-file failure without losing the batch", async () => {
    const user = userEvent.setup();
    global.fetch
      .mockResolvedValueOnce(
        jsonResponse(
          { detail: { message: "This file was already uploaded as invoice 3", invoice_id: 3 } },
          { status: 409 },
        ),
      )
      .mockResolvedValueOnce(jsonResponse(invoiceResponse({ invoice_number: "INV-2" })));

    renderPage();
    await user.upload(screen.getByLabelText("Choose files"), [file("a.txt"), file("b.txt")]);

    expect(await screen.findByText(/already uploaded as invoice 3/)).toBeInTheDocument();
    expect(await screen.findByText("INV-2")).toBeInTheDocument();
  });

  it("uploads a batch one file at a time", async () => {
    const user = userEvent.setup();
    global.fetch.mockResolvedValue(jsonResponse(invoiceResponse()));

    renderPage();
    await user.upload(screen.getByLabelText("Choose files"), [
      file("a.txt"),
      file("b.txt"),
      file("c.txt"),
    ]);

    // Sequential rather than concurrent: a burst hits the free tier's rate
    // limit and every invoice after the first falls back to heuristics.
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(3));
  });

  it("refuses an oversized file without asking the server", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.upload(screen.getByLabelText("Choose files"), sizedFile("scan.txt", 41 * 1024 * 1024));

    // The point of the client-side check: a 41 MB scan should be refused
    // before it is read off disk and pushed over a phone connection.
    expect(await screen.findByText(/over the 15 MB limit/)).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("refuses a file type the parser cannot read", async () => {
    const { container } = renderPage();

    // Dropped rather than picked. The `accept` attribute already filters the
    // file dialog, so a .zip cannot arrive that way — but drag-and-drop
    // ignores `accept` entirely, which is exactly why the JS check is not
    // redundant with the attribute.
    fireEvent.drop(container.querySelector(".dropzone"), {
      dataTransfer: { files: [new File(["PK"], "scans.zip", { type: "application/zip" })] },
    });

    expect(await screen.findByText(/which cannot be read/)).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("accepts a dropped file the parser can read", async () => {
    const { container } = renderPage();
    global.fetch.mockResolvedValueOnce(jsonResponse(invoiceResponse()));

    fireEvent.drop(container.querySelector(".dropzone"), {
      dataTransfer: { files: [file("dropped.txt")] },
    });

    expect(await screen.findByText("INV-2026-0042")).toBeInTheDocument();
  });

  it("refuses an empty file and suggests why it is empty", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.upload(screen.getByLabelText("Choose files"), sizedFile("invoice.txt", 0));

    // Zero bytes otherwise reaches the parser and comes back as "no fields
    // found", which reads like the extraction failed rather than the file.
    expect(await screen.findByText(/still be downloading/)).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("uploads the good files in a batch and reports the rejected one", async () => {
    const user = userEvent.setup();
    global.fetch.mockResolvedValue(jsonResponse(invoiceResponse()));

    renderPage();
    await user.upload(screen.getByLabelText("Choose files"), [
      file("good.txt"),
      sizedFile("huge.txt", 41 * 1024 * 1024),
      file("also-good.txt"),
    ]);

    // Dropping the bad file silently is how a 40-file batch quietly becomes 38.
    expect(await screen.findByText(/over the 15 MB limit/)).toBeInTheDocument();
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
  });

  it("names the file it is working on during a batch", async () => {
    const user = userEvent.setup();
    let release;
    global.fetch.mockReturnValueOnce(new Promise((resolve) => {
      release = () => resolve(jsonResponse(invoiceResponse()));
    }));

    renderPage();
    await user.upload(screen.getByLabelText("Choose files"), [file("first.txt"), file("second.txt")]);

    // On a long batch the file taking the time is what the user wants to know.
    expect(await screen.findByText(/Extracting 1 of 2 — first.txt/)).toBeInTheDocument();
    release();
  });

  it("surfaces the plan limit as the server stated it", async () => {
    const user = userEvent.setup();
    global.fetch.mockResolvedValueOnce(
      jsonResponse(
        { detail: "Plan 'free' allows 50 invoices per month. Upgrade to continue uploading." },
        { status: 402 },
      ),
    );

    renderPage();
    await user.upload(screen.getByLabelText("Choose files"), file());

    expect(await screen.findByText(/Upgrade to continue uploading/)).toBeInTheDocument();
  });

  describe("dragging files onto the dropzone", () => {
    // Dragging a scanned bill straight out of the mail client is the way most
    // of these arrive, so the drop path deserves the same cover as the picker.
    function dropzone(container) {
      return container.querySelector(".dropzone");
    }

    it("highlights the target while a file is over it", () => {
      const { container } = renderPage();

      fireEvent.dragOver(dropzone(container));

      expect(dropzone(container)).toHaveClass("is-dragging");
    });

    it("drops the highlight when the file is dragged away again", () => {
      const { container } = renderPage();
      fireEvent.dragOver(dropzone(container));

      fireEvent.dragLeave(dropzone(container));

      expect(dropzone(container)).not.toHaveClass("is-dragging");
    });

    it("uploads what was dropped", async () => {
      global.fetch = vi.fn().mockResolvedValue(jsonResponse(invoiceResponse()));
      const { container } = renderPage();

      fireEvent.drop(dropzone(container), { dataTransfer: { files: [file("dropped.txt")] } });

      expect(await screen.findByText("INV-2026-0042")).toBeInTheDocument();
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it("clears the highlight once the drop is handled", async () => {
      // Otherwise the zone stays lit after the drop and looks stuck.
      global.fetch = vi.fn().mockResolvedValue(jsonResponse(invoiceResponse()));
      const { container } = renderPage();
      fireEvent.dragOver(dropzone(container));

      fireEvent.drop(dropzone(container), { dataTransfer: { files: [file("dropped.txt")] } });

      await waitFor(() => expect(dropzone(container)).not.toHaveClass("is-dragging"));
    });

    describe("a second batch dropped while the first is still going", () => {
      /**
       * An upload the test releases by hand, so a second drop can be made to
       * land while the first batch is genuinely mid-flight.
       */
      function heldUpload() {
        const pending = [];
        global.fetch = vi.fn(
          () =>
            new Promise((resolve) => {
              pending.push(() => resolve(jsonResponse(invoiceResponse())));
            }),
        );
        return pending;
      }

      it("does not start a second run alongside the first", async () => {
        // The picker is `disabled` while a batch runs, so the design already
        // says one at a time. The dropzone had no such guard, and two loops at
        // once defeat the thing the upload loop is sequential for: each file
        // costs a model call, and a burst is what the free tier rate-limits.
        const pending = heldUpload();
        const { container } = renderPage();

        fireEvent.drop(dropzone(container), {
          dataTransfer: { files: [file("first.txt")] },
        });
        await waitFor(() => expect(pending).toHaveLength(1));

        fireEvent.drop(dropzone(container), {
          dataTransfer: { files: [file("second.txt")] },
        });

        expect(await screen.findByText(/Still extracting the last batch/)).toBeInTheDocument();
        // The second drop must not have put another upload on the wire.
        expect(pending).toHaveLength(1);
      });

      it("takes the batch once the first one has finished", async () => {
        const pending = heldUpload();
        const { container } = renderPage();

        fireEvent.drop(dropzone(container), {
          dataTransfer: { files: [file("first.txt")] },
        });
        await waitFor(() => expect(pending).toHaveLength(1));
        // Released inside `act` because resolving it is what drives the state
        // updates that end the batch.
        await act(async () => pending[0]());
        await screen.findByText("INV-2026-0042");

        // Busy is over, so the zone accepts again — the refusal is about
        // overlap, not a door that stays shut.
        fireEvent.drop(dropzone(container), {
          dataTransfer: { files: [file("second.txt")] },
        });

        await waitFor(() => expect(pending).toHaveLength(2));
      });

      it("does not invite a drop it is about to refuse", async () => {
        const pending = heldUpload();
        const { container } = renderPage();
        fireEvent.drop(dropzone(container), {
          dataTransfer: { files: [file("first.txt")] },
        });
        await waitFor(() => expect(pending).toHaveLength(1));

        fireEvent.dragOver(dropzone(container));

        expect(dropzone(container)).not.toHaveClass("is-dragging");
      });
    });

    it("ignores a drop that carries no files", async () => {
      // Dragging selected text or a link onto the page fires the same event.
      global.fetch = vi.fn();
      const { container } = renderPage();

      fireEvent.drop(dropzone(container), { dataTransfer: { files: [] } });

      await waitFor(() => expect(dropzone(container)).not.toHaveClass("is-dragging"));
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("ignores a drop with no file list at all rather than throwing on it", async () => {
      // Not the same event as the one above. `Array.from(undefined)` throws,
      // and a throw here escapes into React's event handling — which takes the
      // page down for a gesture that should simply do nothing.
      global.fetch = vi.fn();
      const { container } = renderPage();

      fireEvent.drop(dropzone(container), { dataTransfer: {} });

      await waitFor(() => expect(dropzone(container)).not.toHaveClass("is-dragging"));
      expect(global.fetch).not.toHaveBeenCalled();
      expect(screen.getByRole("heading", { name: "Upload invoices" })).toBeInTheDocument();
    });
  });
});

describe("running out of the monthly allowance mid-batch", () => {
  beforeEach(() => {
    localStorage.clear();
    global.fetch = vi.fn();
  });

  afterEach(() => vi.restoreAllMocks());

  it("stops uploading once the allowance is spent", async () => {
    // The allowance does not come back partway through a batch, so every
    // remaining file gets the same 402. Carrying on spends the upload rate
    // limit on requests that cannot succeed.
    const user = userEvent.setup();
    global.fetch
      .mockResolvedValueOnce(jsonResponse(invoiceResponse()))
      .mockResolvedValueOnce(
        jsonResponse({ detail: "Monthly invoice allowance used up" }, { status: 402 }),
      );

    renderPage();
    await user.upload(screen.getByLabelText("Choose files"), [
      file("a.txt"),
      file("b.txt"),
      file("c.txt"),
      file("d.txt"),
    ]);

    await screen.findByRole("alert");
    // One success, one refusal, and nothing attempted after it.
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
  });

  it("lists the files it did not attempt rather than dropping them", async () => {
    // A batch that quietly shrinks from four to two is how an invoice goes
    // missing from a return.
    const user = userEvent.setup();
    global.fetch.mockResolvedValueOnce(
      jsonResponse({ detail: "Monthly invoice allowance used up" }, { status: 402 }),
    );

    renderPage();
    await user.upload(screen.getByLabelText("Choose files"), [
      file("a.txt"),
      file("b.txt"),
      file("c.txt"),
    ]);

    expect(await screen.findByText("b.txt")).toBeInTheDocument();
    expect(screen.getByText("c.txt")).toBeInTheDocument();
    expect(screen.getAllByText(/allowance ran out before this file/)).toHaveLength(2);
  });

  it("says how many were left and what to do about it", async () => {
    const user = userEvent.setup();
    global.fetch.mockResolvedValueOnce(
      jsonResponse({ detail: "Monthly invoice allowance used up" }, { status: 402 }),
    );

    renderPage();
    await user.upload(screen.getByLabelText("Choose files"), [file("a.txt"), file("b.txt")]);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /1 file\(s\) were not uploaded.*Upgrade the plan/,
    );
  });

  // The per-minute upload ceiling is the other answer about the account rather
  // than the document. It differs from the allowance in the direction that
  // matters: carrying on does not merely fail, it spends the budget that would
  // have let the rest of the batch through, because the limiter counts the
  // requests it refuses too.
  it("stops uploading once the upload rate limit is reached", async () => {
    const user = userEvent.setup();
    global.fetch
      .mockResolvedValueOnce(jsonResponse(invoiceResponse()))
      .mockResolvedValueOnce(
        jsonResponse({ detail: "Too many requests. Try again in 45s." }, { status: 429 }),
      );

    renderPage();
    await user.upload(screen.getByLabelText("Choose files"), [
      file("a.txt"),
      file("b.txt"),
      file("c.txt"),
      file("d.txt"),
    ]);

    await screen.findByRole("alert");
    // One success, one refusal, and nothing attempted after it. Left running,
    // c and d would have been charged against the same window they were
    // waiting on.
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
  });

  it("lists the files the rate limit cost, and says they can just be dropped again", async () => {
    const user = userEvent.setup();
    global.fetch.mockResolvedValueOnce(
      jsonResponse({ detail: "Too many requests. Try again in 45s." }, { status: 429 }),
    );

    renderPage();
    await user.upload(screen.getByLabelText("Choose files"), [
      file("a.txt"),
      file("b.txt"),
      file("c.txt"),
    ]);

    expect(await screen.findByText("b.txt")).toBeInTheDocument();
    expect(screen.getByText("c.txt")).toBeInTheDocument();
    expect(screen.getAllByText(/rate limit was reached before this file/)).toHaveLength(2);
    // Unlike the allowance, this comes good on its own — so the instruction is
    // to wait and retry, not to go and buy something.
    expect(screen.getByRole("alert")).toHaveTextContent(
      /2 file\(s\) were not uploaded.*drop them again/,
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent(/Upgrade the plan/);
  });

  it("leaves the seconds to the row the server answered", async () => {
    // The banner says only what the rows cannot: how much of the batch never
    // went. The wait itself is the server's sentence, and it is already on the
    // row for the file that was actually refused.
    const user = userEvent.setup();
    global.fetch.mockResolvedValueOnce(
      jsonResponse({ detail: "Too many requests. Try again in 45s." }, { status: 429 }),
    );

    renderPage();
    await user.upload(screen.getByLabelText("Choose files"), [file("a.txt"), file("b.txt")]);

    expect(await screen.findByText("Too many requests. Try again in 45s.")).toBeInTheDocument();
  });

  it("keeps going through an ordinary per-file failure", async () => {
    // A duplicate or an unreadable scan says nothing about the next file, so
    // only the allowance stops the batch.
    const user = userEvent.setup();
    global.fetch
      .mockResolvedValueOnce(
        jsonResponse({ detail: { message: "Already on file", invoice_id: 3 } }, { status: 409 }),
      )
      .mockResolvedValueOnce(jsonResponse(invoiceResponse()));

    renderPage();
    await user.upload(screen.getByLabelText("Choose files"), [file("a.txt"), file("b.txt")]);

    expect(await screen.findByText("INV-2026-0042")).toBeInTheDocument();
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
  });
});

describe("the invoice type while a batch is running", () => {
  /** An upload that stays in flight until the returned callback is called. */
  function heldUpload() {
    const pending = [];
    global.fetch = vi.fn(
      () =>
        new Promise((resolve) => {
          pending.push(() => resolve(jsonResponse(invoiceResponse())));
        }),
    );
    return pending;
  }

  it("locks the picker so the screen cannot disagree with what is being sent", async () => {
    // `uploadFiles` reads the type once and the loop under it is sequential,
    // so a forty-file batch goes on sending the type it started with for
    // minutes. Left live, the radio moved and the uploads did not: the screen
    // said Sales while the rest of the batch was still booked as purchases.
    //
    // Which is the expensive direction. A sales invoice booked as a purchase
    // claims credit against the business's own output tax, and no screen
    // downstream re-reads the document to catch it.
    const user = userEvent.setup();
    const pending = heldUpload();

    renderPage();
    await user.upload(screen.getByLabelText("Choose files"), [file("a.txt"), file("b.txt")]);
    await waitFor(() => expect(pending).toHaveLength(1));

    expect(screen.getByLabelText("Sales (feeds GSTR-1)")).toBeDisabled();
    expect(screen.getByLabelText("Purchase (claim ITC)")).toBeDisabled();
  });

  it("unlocks it once the batch is done", async () => {
    const user = userEvent.setup();
    const pending = heldUpload();

    renderPage();
    await user.upload(screen.getByLabelText("Choose files"), file("a.txt"));
    await waitFor(() => expect(pending).toHaveLength(1));
    await act(async () => pending[0]());
    await screen.findByText("INV-2026-0042");

    expect(screen.getByLabelText("Sales (feeds GSTR-1)")).toBeEnabled();
  });

  it("keeps the whole batch on the type it was started with", async () => {
    // The batch is the honest unit: splitting one drop across two types by
    // how fast someone clicked is not a thing anyone can predict.
    const user = userEvent.setup();
    const pending = heldUpload();

    renderPage();
    await user.click(screen.getByLabelText("Sales (feeds GSTR-1)"));
    await user.upload(screen.getByLabelText("Choose files"), [file("a.txt"), file("b.txt")]);

    await waitFor(() => expect(pending).toHaveLength(1));
    await act(async () => pending[0]());
    await waitFor(() => expect(pending).toHaveLength(2));
    await act(async () => pending[1]());

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    for (const call of global.fetch.mock.calls) {
      expect(call[1].body.get("invoice_type")).toBe("sales");
    }
  });
});
