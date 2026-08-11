import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";

/**
 * The GST state codes, fetched once per session.
 *
 * The list belongs to the server (`STATE_CODES` in app/services/gstin.py) and
 * changes when the Council reorganises a state or a union territory — which is
 * why `validate.js` deliberately keeps no copy of it, and why a form that wants
 * to *name* the codes has to ask for them rather than ship a second list that
 * will eventually disagree with the one deciding whether a return uploads.
 *
 * Fetched lazily, on the first render of the first consumer, rather than when
 * the provider mounts. The provider sits above the router so that the answer
 * survives navigation between invoices, and eagerly loading there would put an
 * unauthenticated request on every browser that only ever reaches the login
 * screen. `/meta/states` is public and metered by address; there is no reason
 * to spend a signed-out visitor's bucket on a list they will never see.
 *
 * A failure is not reported anywhere. Every consumer has a way to work without
 * the list — the invoice form falls back to the text box the field has always
 * been — so the lookup being unavailable degrades a picker into typing rather
 * than into a banner about a request the user did not make.
 */
const StateCodesContext = createContext(null);

export function StateCodesProvider({ children }) {
  const [codes, setCodes] = useState(null);
  // React 18 mounts effects twice under StrictMode, and a remounting consumer
  // asks again on every mount. Neither should re-request a list that cannot
  // change within a session.
  const started = useRef(false);

  const load = useCallback(() => {
    if (started.current) return;
    started.current = true;
    // An empty list on failure rather than a stuck `null`: both read as "no
    // list" to `useStateCodes`, and settling on one keeps a retry out of the
    // picture — there is nothing here worth a second request.
    api.states().then(setCodes, () => setCodes({}));
  }, []);

  return (
    <StateCodesContext.Provider value={{ codes, load }}>{children}</StateCodesContext.Provider>
  );
}

/**
 * The code-to-name map, or `null` when there is not one to show.
 *
 * `null` covers all three ways a caller can be without the list — no provider
 * above it, the request still in flight, the request refused — because a caller
 * does the same thing in each: render the field someone can type into. Callers
 * that told those apart would each have to decide what a half-loaded picker
 * looks like, and the honest answer for all of them is the text box.
 */
export function useStateCodes() {
  const ctx = useContext(StateCodesContext);
  const load = ctx?.load;
  useEffect(() => {
    load?.();
  }, [load]);
  const codes = ctx?.codes;
  return codes && Object.keys(codes).length > 0 ? codes : null;
}

export { StateCodesContext };
