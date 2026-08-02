import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import { AuthProvider } from "./hooks/useAuth";
import { PageTitleProvider } from "./hooks/usePageTitle";
import "./index.css";

// Two boundaries, deliberately. This outer one is the last resort — it catches
// a crash in the Shell or the auth provider itself, where the inner per-page
// boundary has already been unmounted. Inside the router, because it resets on
// navigation and needs useLocation.
//
// PageTitleProvider sits outside that boundary rather than in: it owns the live
// region that announces route changes, and the one navigation most worth
// announcing is the one away from a screen that has just crashed.
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <PageTitleProvider>
        <ErrorBoundary>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ErrorBoundary>
      </PageTitleProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
