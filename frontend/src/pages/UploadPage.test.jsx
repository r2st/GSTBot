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

/**
 * The batch endpoint's shape: one outcome per file, whatever happened to it.
 *
 * `accepted` is the field the page switches on, so a rejected file carries an
 * `error` and no invoice — a bad page in a folder of fifty costs that page
 * alone, which is the whole reason the endpoint answers this way instead of
 * failing the request.
 */
function bulkResponse(items) {
  const list = items.map((item) =>
    item.accepted === false
      ? { filename: item.filename, accepted: false, error: item.error }
      : {
          filename: item.filename ?? "invoice.txt",
          accepted: true,
          queued: false,
          invoice: { ...invoiceResponse(item.invoice ?? {}).invoice },
        },
  );
  const accepted = list.filter((item) => item.accepted).length;
  return { total: list.length, accepted, rejected: list.length - accepted, items: list };
}

/** The commonest case: one file, accepted. */
function oneAccepted(overrides = {}, filename = "invoice.txt") {
  return bulkResponse([{ filename, invoice: overrides }]);
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
    global.fetch.mockResolvedValueOnce(jsonResponse(oneAccepted()));

    renderPage();
    await user.upload(screen.getByLabelText("Choose files"), file());

    expect(await screen.findByText("INV-2026-0042")).toBeInTheDocument();
    expect(screen.getByText(/₹5,31,000.00/)).toBeInTheDocument();
  });

  it("defaults to a purchase, since that is what ITC is claimed on", async () => {
    const user = userEvent.setup();
    global.fetch.mockResolvedValueOnce(jsonResponse(oneAccepted()));

    renderPage();
    expect(screen.getByLabelText("Purchase (claim ITC)")).toBeChecked();

    await user.upload(screen.getByLabelText("Choose files"), file());
    await waitFor(() => {
      expect(global.fetch.mock.calls[0][1].body.get("invoice_type")).toBe("purchase");
    });
  });

  it("sends the chosen type when uploading a sales invoice", async () => {
    const user = userEvent.setup();
    global.fetch.mockResolvedValueOnce(jsonResponse(oneAccepted()));

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
      jsonResponse(oneAccepted({ warnings: ["No valid supplier GSTIN found"] })),
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
      jsonResponse(
        bulkResponse([
          {
            filename: "photo.txt",
            invoice: { id: 12, invoice_value: "0.00", invoice_number: undefined,
              counterparty_gstin: undefined, invoice_date: undefined },
          },
        ]),
      ),
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
    // One bad page in a folder of fifty costs that page alone. The server says
    // so per file, which is why the batch endpoint answers 200 with outcomes
    // rather than failing the request.
    global.fetch.mockResolvedValueOnce(
      jsonResponse(
        bulkResponse([
          {
            filename: "a.txt",
            accepted: false,
            error: "This file was already uploaded as invoice 3",
          },
          { filename: "b.txt", invoice: { invoice_number: "INV-2" } },
        ]),
      ),
    );

    renderPage();
    await user.upload(screen.getByLabelText("Choose files"), [file("a.txt"), file("b.txt")]);

    expect(await screen.findByText(/already uploaded as invoice 3/)).toBeInTheDocument();
    expect(await screen.findByText("INV-2")).toBeInTheDocument();
  });

  it("sends a batch as one request rather than one request per file", async () => {
    // The per-minute upload ceiling counts requests. Ninety files sent one at a
    // time spent it partway through and refused their own tail — and the files
    // that met the refusal were the ones that would otherwise have gone through.
    const user = userEvent.setup();
    global.fetch.mockResolvedValue(
      jsonResponse(
        bulkResponse([{ filename: "a.txt" }, { filename: "b.txt" }, { filename: "c.txt" }]),
      ),
    );

    renderPage();
    await user.upload(screen.getByLabelText("Choose files"), [
      file("a.txt"),
      file("b.txt"),
      file("c.txt"),
    ]);

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    expect(global.fetch.mock.calls[0][1].body.getAll("files")).toHaveLength(3);
  });

  it("splits a drop too big for one request into batches", async () => {
    // Ten at a time, so the progress line has something to say more often than
    // once per fifty files.
    const user = userEvent.setup();
    global.fetch.mockResolvedValue(jsonResponse(bulkResponse([{ filename: "x.txt" }])));

    renderPage();
    const many = Array.from({ length: 23 }, (_, i) => file(`file-${i}.txt`));
    await user.upload(screen.getByLabelText("Choose files"), many);

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(3));
    expect(global.fetch.mock.calls[0][1].body.getAll("files")).toHaveLength(10);
    expect(global.fetch.mock.calls[2][1].body.getAll("files")).toHaveLength(3);
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
    global.fetch.mockResolvedValueOnce(jsonResponse(oneAccepted()));

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
    global.fetch.mockResolvedValue(jsonResponse(oneAccepted()));

    renderPage();
    await user.upload(screen.getByLabelText("Choose files"), [
      file("good.txt"),
      sizedFile("huge.txt", 41 * 1024 * 1024),
      file("also-good.txt"),
    ]);

    // Dropping the bad file silently is how a 40-file batch quietly becomes 38.
    expect(await screen.findByText(/over the 15 MB limit/)).toBeInTheDocument();
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    // The oversized one is refused here and never reaches the request.
    expect(global.fetch.mock.calls[0][1].body.getAll("files")).toHaveLength(2);
  });

  it("says how far through the drop it is", async () => {
    const user = userEvent.setup();
    let release;
    global.fetch.mockReturnValueOnce(new Promise((resolve) => {
      release = () => resolve(jsonResponse(bulkResponse([{ filename: "first.txt" }])));
    }));

    renderPage();
    await user.upload(screen.getByLabelText("Choose files"), [file("first.txt"), file("second.txt")]);

    // A range rather than a filename: several files are in flight at once, and
    // naming one of them would be picking one at random and calling it the
    // slow one.
    expect(await screen.findByText(/Extracting 1–2 of 2/)).toBeInTheDocument();
    release();
  });

  it("counts a single file as one, not as a range from itself to itself", async () => {
    const user = userEvent.setup();
    let release;
    global.fetch.mockReturnValueOnce(new Promise((resolve) => {
      release = () => resolve(jsonResponse(oneAccepted()));
    }));

    renderPage();
    await user.upload(screen.getByLabelText("Choose files"), file("only.txt"));

    expect(await screen.findByText(/Extracting 1 of 1/)).toBeInTheDocument();
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
      global.fetch = vi.fn().mockResolvedValue(jsonResponse(oneAccepted()));
      const { container } = renderPage();

      fireEvent.drop(dropzone(container), { dataTransfer: { files: [file("dropped.txt")] } });

      expect(await screen.findByText("INV-2026-0042")).toBeInTheDocument();
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it("clears the highlight once the drop is handled", async () => {
      // Otherwise the zone stays lit after the drop and looks stuck.
      global.fetch = vi.fn().mockResolvedValue(jsonResponse(oneAccepted()));
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
              pending.push(() => resolve(jsonResponse(oneAccepted())));
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

  /** More files than fit in one request, so there is a "rest of the batch". */
  function manyFiles(count) {
    return Array.from({ length: count }, (_, i) => file(`file-${i}.txt`));
  }

  it("stops uploading once the allowance is spent", async () => {
    // The allowance does not come back partway through a drop, so every
    // remaining batch gets the same 402. Carrying on spends the upload rate
    // limit on requests that cannot succeed.
    const user = userEvent.setup();
    global.fetch
      .mockResolvedValueOnce(jsonResponse(bulkResponse([{ filename: "a.txt" }])))
      .mockResolvedValueOnce(
        jsonResponse({ detail: "Monthly invoice allowance used up" }, { status: 402 }),
      );

    renderPage();
    await user.upload(screen.getByLabelText("Choose files"), manyFiles(25));

    await screen.findByRole("alert");
    // One batch through, one refused, and the third never sent.
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
  });

  it("lists the files it did not attempt rather than dropping them", async () => {
    // A drop that quietly shrinks from fifteen to ten is how an invoice goes
    // missing from a return.
    const user = userEvent.setup();
    global.fetch.mockResolvedValueOnce(
      jsonResponse({ detail: "Monthly invoice allowance used up" }, { status: 402 }),
    );

    renderPage();
    await user.upload(screen.getByLabelText("Choose files"), manyFiles(15));

    expect(await screen.findByText("file-14.txt")).toBeInTheDocument();
    // The five that were never sent, each said to be unattempted.
    expect(screen.getAllByText(/allowance ran out before this file/)).toHaveLength(5);
  });

  it("says how many were left and what to do about it", async () => {
    const user = userEvent.setup();
    global.fetch.mockResolvedValueOnce(
      jsonResponse({ detail: "Monthly invoice allowance used up" }, { status: 402 }),
    );

    renderPage();
    await user.upload(screen.getByLabelText("Choose files"), manyFiles(13));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /3 file\(s\) were not uploaded.*Upgrade the plan/,
    );
  });

  // The per-minute upload ceiling is the other answer about the account rather
  // than the document. It differs from the allowance in the direction that
  // matters: carrying on does not merely fail, it spends the budget that would
  // have let the rest of the drop through, because the limiter counts the
  // requests it refuses too.
  it("stops uploading once the upload rate limit is reached", async () => {
    const user = userEvent.setup();
    global.fetch
      .mockResolvedValueOnce(jsonResponse(bulkResponse([{ filename: "a.txt" }])))
      .mockResolvedValueOnce(
        jsonResponse({ detail: "Too many requests. Try again in 45s." }, { status: 429 }),
      );

    renderPage();
    await user.upload(screen.getByLabelText("Choose files"), manyFiles(25));

    await screen.findByRole("alert");
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
  });

  it("lists the files the rate limit cost, and says they can just be dropped again", async () => {
    const user = userEvent.setup();
    global.fetch.mockResolvedValueOnce(
      jsonResponse({ detail: "Too many requests. Try again in 45s." }, { status: 429 }),
    );

    renderPage();
    await user.upload(screen.getByLabelText("Choose files"), manyFiles(15));

    expect(await screen.findByText("file-14.txt")).toBeInTheDocument();
    expect(screen.getAllByText(/rate limit was reached before this file/)).toHaveLength(5);
    // Unlike the allowance, this comes good on its own — so the instruction is
    // to wait and retry, not to go and buy something.
    expect(screen.getByRole("alert")).toHaveTextContent(
      /5 file\(s\) were not uploaded.*drop them again/,
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent(/Upgrade the plan/);
  });

  it("leaves the seconds to the rows the server answered", async () => {
    // The banner says only what the rows cannot: how much of the drop never
    // went. The wait itself is the server's sentence, and it is already on the
    // rows for the files that were actually refused.
    const user = userEvent.setup();
    global.fetch.mockResolvedValueOnce(
      jsonResponse({ detail: "Too many requests. Try again in 45s." }, { status: 429 }),
    );

    renderPage();
    await user.upload(screen.getByLabelText("Choose files"), manyFiles(15));

    expect(
      await screen.findAllByText("Too many requests. Try again in 45s."),
    ).toHaveLength(10);
  });

  it("keeps going through an ordinary per-file failure", async () => {
    // A duplicate or an unreadable scan says nothing about the next file, so it
    // is one rejected row in a batch the server otherwise accepted.
    const user = userEvent.setup();
    global.fetch.mockResolvedValueOnce(
      jsonResponse(
        bulkResponse([
          { filename: "a.txt", accepted: false, error: "Already on file" },
          { filename: "b.txt" },
        ]),
      ),
    );

    renderPage();
    await user.upload(screen.getByLabelText("Choose files"), [file("a.txt"), file("b.txt")]);

    expect(await screen.findByText("INV-2026-0042")).toBeInTheDocument();
    expect(screen.getByText("Already on file")).toBeInTheDocument();
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
  });
});

describe("the invoice type while a batch is running", () => {
  /** An upload that stays in flight until the returned callback is called. */
  function heldUpload() {
    const pending = [];
    global.fetch = vi.fn(
      () =>
        new Promise((resolve) => {
          pending.push(() => resolve(jsonResponse(oneAccepted())));
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
    // More than one request's worth, so there is a second batch to send under
    // a type the radio could have been moved to in between.
    await user.upload(
      screen.getByLabelText("Choose files"),
      Array.from({ length: 12 }, (_, i) => file(`file-${i}.txt`)),
    );

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
