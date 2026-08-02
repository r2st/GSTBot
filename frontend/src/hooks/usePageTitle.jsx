import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

/**
 * Per-route document titles, and the announcement that goes with them.
 *
 * Two problems, one cause. Every screen in this app shared the single title
 * from index.html, so a browser history full of GST work read as eight
 * identical "GSTBot" entries, and a bookmarked reconciliation was
 * indistinguishable from a bookmarked upload form.
 *
 * The second is the one that matters more. Following a link in a
 * server-rendered site makes the browser announce the new page; a client-side
 * route change is silent, because from the assistive technology's point of view
 * nothing navigated — some DOM was replaced. A screen reader user clicks
 * "Reconcile" and is told nothing at all. The fix is the standard one: a live
 * region that outlives the routes, holding the name of whatever just rendered.
 *
 * The region has to sit above the router for that to work. A live region that
 * mounts at the same moment as its own text is not reliably announced — the
 * region has to already be in the accessibility tree when the text lands, which
 * is why this is a provider wrapping the routes rather than a line in Shell.
 */

const SUFFIX = "GSTBot";
const DEFAULT_TITLE = "GSTBot — GST compliance on autopilot";

function formatTitle(title) {
  return title ? `${title} · ${SUFFIX}` : DEFAULT_TITLE;
}

const PageTitleContext = createContext(null);

export function PageTitleProvider({ children }) {
  const [announcement, setAnnouncement] = useState("");
  const hasAnnounced = useRef(false);

  const set = useCallback((title) => {
    document.title = formatTitle(title);

    // The first title of a session is the one the browser reads out as part of
    // loading the document. Repeating it here says everything twice.
    if (!hasAnnounced.current) {
      hasAnnounced.current = true;
      return;
    }
    setAnnouncement(title || DEFAULT_TITLE);
  }, []);

  return (
    <PageTitleContext.Provider value={set}>
      {children}
      <p className="visually-hidden" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
    </PageTitleContext.Provider>
  );
}

/**
 * Names the current screen.
 *
 * Pass a falsy title while the name is still loading — an invoice whose number
 * has not arrived — and the tab shows the app name until it does, rather than
 * "undefined · GSTBot".
 *
 * Works without the provider, minus the announcement, so a page rendered on its
 * own in a test still sets a sensible title instead of throwing.
 */
export function usePageTitle(title) {
  const set = useContext(PageTitleContext);
  useEffect(() => {
    if (set) {
      set(title);
      return;
    }
    document.title = formatTitle(title);
  }, [set, title]);
}

export { DEFAULT_TITLE, formatTitle };
