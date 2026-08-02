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

    return (
      <div className="panel error-fallback" role="alert">
        <h2>This screen hit an error</h2>
        <p className="muted">
          Nothing you have entered was lost — the failure is in displaying this page, not in
          saving your data. Try again, or move to another screen and come back.
        </p>
        <p className="small muted error-fallback-detail">{String(this.state.error?.message || this.state.error)}</p>
        <div className="button-row">
          <button type="button" className="btn btn-primary" onClick={() => this.setState({ error: null })}>
            Try again
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => window.location.reload()}>
            Reload the app
          </button>
        </div>
      </div>
    );
  }
}

/**
 * Wraps the boundary so it resets on navigation.
 *
 * Split in two because useLocation is a hook and the boundary must be a class;
 * the pathname is passed down as the reset key.
 */
export default function ErrorBoundary({ children }) {
  const location = useLocation();
  return <ErrorBoundaryInner resetKey={location.pathname}>{children}</ErrorBoundaryInner>;
}

export { ErrorBoundaryInner };
