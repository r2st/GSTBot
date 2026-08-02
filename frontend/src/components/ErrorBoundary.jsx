import { Component } from "react";
import { useLocation } from "react-router-dom";

/**
 * Catches render-time crashes so one bad field does not blank the whole app.
 *
 * A class because there is still no hook equivalent of componentDidCatch. Note
 * what this does *not* catch: rejected promises, event handlers, anything
 * async. Those are the API errors, and the pages already surface them through
 * ErrorBanner. What lands here is the other kind — a shape from the server that
 * the render did not expect, e.g. a null where a nested total was assumed.
 * Without a boundary that is a white screen, and the user has no idea whether
 * their upload saved.
 *
 * The fallback is a prop rather than fixed markup because the boundary is used
 * at two scales. Around a route, taking over the content area is right. Around
 * a single widget it is not: a chart that cannot draw should cost the chart,
 * not the four stat cards and the tax table sitting above it.
 */
class ErrorBoundaryInner extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Kept: the browser console is the only reporting channel this app has,
    // and componentDidCatch swallows the default React logging.
    console.error("Render error:", error, info?.componentStack);
  }

  componentDidUpdate(prevProps) {
    // Navigating away is the natural "try something else". Without this the
    // boundary stays broken and every subsequent route renders the fallback,
    // which looks like the whole app died rather than one screen.
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return this.props.renderFallback({
      error: this.state.error,
      reset: () => this.setState({ error: null }),
    });
  }
}

/** The whole-screen fallback: the route rendered nothing usable. */
function PageFallback({ error, reset }) {
  return (
    <div className="panel error-fallback" role="alert">
      <h2>This screen hit an error</h2>
      <p className="muted">
        Nothing you have entered was lost — the failure is in displaying this page, not in
        saving your data. Try again, or move to another screen and come back.
      </p>
      <p className="small muted error-fallback-detail">{String(error?.message || error)}</p>
      <div className="button-row">
        <button type="button" className="btn btn-primary" onClick={reset}>
          Try again
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => window.location.reload()}>
          Reload the app
        </button>
      </div>
    </div>
  );
}

/**
 * The widget-scale fallback.
 *
 * Deliberately quiet — role="status" rather than role="alert". A chart that
 * failed to draw while the numbers it summarises are still on screen is not
 * something to interrupt a screen reader for, and the page-level boundary is
 * already the loud one. It says which section is missing, because "something
 * went wrong" floating between two panels does not tell the user what they are
 * no longer looking at.
 */
function SectionFallback({ name, error, reset }) {
  return (
    <div className="panel error-fallback error-fallback-section" role="status">
      <p className="section-fallback-head">{name} could not be displayed</p>
      <p className="small muted error-fallback-detail">{String(error?.message || error)}</p>
      <button type="button" className="btn btn-ghost" onClick={reset}>
        Retry this section
      </button>
    </div>
  );
}

/**
 * Wraps the boundary so it resets on navigation.
 *
 * Split in two because useLocation is a hook and the boundary must be a class;
 * the pathname is passed down as the reset key.
 */
export default function ErrorBoundary({ children }) {
  const location = useLocation();
  return (
    <ErrorBoundaryInner resetKey={location.pathname} renderFallback={PageFallback}>
      {children}
    </ErrorBoundaryInner>
  );
}

/**
 * Isolates one widget on an otherwise working page.
 *
 * The case this exists for is on the dashboard: the trend chart reads
 * `net_liability.total` off six period summaries, and a single null in any of
 * them throws during render. Without a boundary here that null costs the stat
 * cards, the tax breakdown and the plan meter as well — everything the user
 * actually came for — because they are siblings under the same route boundary.
 *
 * `name` is what the user loses, phrased as they would name it, since that is
 * the whole content of the fallback.
 */
export function SectionBoundary({ name, children }) {
  const location = useLocation();
  return (
    <ErrorBoundaryInner
      resetKey={location.pathname}
      renderFallback={(props) => <SectionFallback name={name} {...props} />}
    >
      {children}
    </ErrorBoundaryInner>
  );
}

export { ErrorBoundaryInner };
