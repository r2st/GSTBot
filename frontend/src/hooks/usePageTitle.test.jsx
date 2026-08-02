import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_TITLE, PageTitleProvider, usePageTitle } from "./usePageTitle";

function Page({ title }) {
  usePageTitle(title);
  return <p>{title || "untitled"}</p>;
}

/** The live region the provider renders, found by its aria-live attribute. */
function announcer() {
  return document.querySelector('[aria-live="polite"][aria-atomic="true"]');
}

describe("usePageTitle", () => {
  beforeEach(() => {
    document.title = DEFAULT_TITLE;
  });

  afterEach(() => {
    document.title = DEFAULT_TITLE;
  });

  describe("the document title", () => {
    it("names the screen and keeps the app name as a suffix", () => {
      render(<Page title="Reconcile" />);
      expect(document.title).toBe("Reconcile · GSTBot");
    });

    it("falls back to the app name when the screen has none yet", () => {
      // InvoiceDetailPage passes a falsy title until the invoice number
      // arrives; "undefined · GSTBot" would be worse than waiting.
      render(<Page title="" />);
      expect(document.title).toBe(DEFAULT_TITLE);
    });

    it("follows a title that changes after the data lands", async () => {
      const user = userEvent.setup();
      function Detail() {
        const [number, setNumber] = useState(null);
        usePageTitle(number ? `Invoice ${number}` : "Invoice");
        return (
          <button type="button" onClick={() => setNumber("INV-9001")}>
            load
          </button>
        );
      }
      render(<Detail />);
      expect(document.title).toBe("Invoice · GSTBot");

      await user.click(screen.getByRole("button"));
      expect(document.title).toBe("Invoice INV-9001 · GSTBot");
    });

    it("works without the provider", () => {
      // Every page test renders its page on its own. The title is the part
      // that should still work there; only the announcement needs the provider.
      render(<Page title="Filing" />);
      expect(document.title).toBe("Filing · GSTBot");
    });
  });

  describe("the route announcement", () => {
    it("renders a polite live region", () => {
      render(
        <PageTitleProvider>
          <Page title="Dashboard" />
        </PageTitleProvider>,
      );
      expect(announcer()).toBeInTheDocument();
    });

    it("stays silent on the first screen of the session", () => {
      // The browser announces the document title as part of loading the page.
      // Repeating it here says everything twice.
      render(
        <PageTitleProvider>
          <Page title="Dashboard" />
        </PageTitleProvider>,
      );
      expect(announcer()).toHaveTextContent("");
    });

    it("announces the screen that a client-side navigation moved to", async () => {
      const user = userEvent.setup();
      function Router() {
        const [page, setPage] = useState("Dashboard");
        return (
          <PageTitleProvider>
            <button type="button" onClick={() => setPage("Reconcile")}>
              go
            </button>
            <Page title={page} />
          </PageTitleProvider>
        );
      }
      render(<Router />);
      expect(announcer()).toHaveTextContent("");

      // A route change replaces some DOM. Nothing navigated as far as a screen
      // reader is concerned, so without this the user is told nothing at all.
      await user.click(screen.getByRole("button"));
      expect(announcer()).toHaveTextContent("Reconcile");
    });

    it("keeps the region mounted across the navigation", async () => {
      const user = userEvent.setup();
      // A live region that mounts at the same moment as its text is not
      // reliably announced — which is why this lives above the router rather
      // than inside Shell.
      function Router() {
        const [page, setPage] = useState("Dashboard");
        return (
          <PageTitleProvider>
            <button type="button" onClick={() => setPage("Filing")}>
              go
            </button>
            <Page title={page} />
          </PageTitleProvider>
        );
      }
      render(<Router />);
      const before = announcer();
      await user.click(screen.getByRole("button"));
      expect(announcer()).toBe(before);
    });

    it("announces the app name when a screen has no title of its own", async () => {
      const user = userEvent.setup();
      function Router() {
        const [page, setPage] = useState("Dashboard");
        return (
          <PageTitleProvider>
            <button type="button" onClick={() => setPage("")}>
              go
            </button>
            <Page title={page} />
          </PageTitleProvider>
        );
      }
      render(<Router />);
      await user.click(screen.getByRole("button"));
      expect(announcer()).toHaveTextContent(DEFAULT_TITLE);
    });

    it("is hidden from the visual layout", () => {
      render(
        <PageTitleProvider>
          <Page title="Dashboard" />
        </PageTitleProvider>,
      );
      expect(announcer()).toHaveClass("visually-hidden");
    });
  });
});
