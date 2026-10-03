import { Navigate, Route, Routes } from "react-router-dom";
import ErrorBoundary from "./components/ErrorBoundary";
import Shell from "./components/Shell";
import { SkeletonPanel } from "./components/Skeleton";
import { useAuth } from "./hooks/useAuth";
import AlertsPage from "./pages/AlertsPage";
import BlogLayout, { BlogIndex } from "./pages/BlogLayout";
import GstComplianceChecklist from "./pages/blog/GstComplianceChecklist";
import GstFilingGuide from "./pages/blog/GstFilingGuide";
import HsnCodeLookup from "./pages/blog/HsnCodeLookup";
import DashboardPage from "./pages/DashboardPage";
import FilingPage from "./pages/FilingPage";
import InvoiceDetailPage from "./pages/InvoiceDetailPage";
import InvoicesPage from "./pages/InvoicesPage";
import ITCPage from "./pages/ITCPage";
import LandingPage from "./pages/LandingPage";
import PricingPage from "./pages/PricingPage";
import ReconcilePage from "./pages/ReconcilePage";
import StatusPage from "./pages/StatusPage";
import SuppliersPage from "./pages/SuppliersPage";
import UploadPage from "./pages/UploadPage";
import UsagePage from "./pages/UsagePage";

function Protected({ children }) {
  const { user, loading } = useAuth();
  // Waiting on /auth/me — rendering the redirect now would bounce a signed-in
  // user to the login page on every refresh.
  if (loading) {
    return (
      <div className="shell-main">
        <SkeletonPanel lines={5} label="Checking your session" />
      </div>
    );
  }
  if (!user) return <Navigate to="/" replace />;
  // The boundary sits inside the Shell rather than around it, so a page that
  // crashes leaves the navigation intact and the user can click away from it.
  //
  // Keyed on the tenant, so switching GSTIN throws the page away and builds a
  // new one rather than re-rendering the old one. Every page here loads on
  // mount and holds what it loaded in state — invoices, findings, ITC, the
  // filing preview — and none of them watch the business, because until now it
  // could not change while they were mounted. Without the key a switch leaves
  // all of it on screen, now captioned by another company's name in the header:
  // one registration's credit at risk read as the other's, which is a number
  // someone acts on. Remounting is also what re-runs each page's own fetch, so
  // the data catches up with the caption rather than the two being reconciled
  // page by page.
  //
  // `user.business.id` rather than the stored selection: this is the tenant the
  // server said the last request acted for, and a key that changed on intent
  // rather than on outcome would clear the screen for a switch that failed.
  return (
    <Shell>
      <ErrorBoundary key={user.business?.id ?? "home"}>{children}</ErrorBoundary>
    </Shell>
  );
}

function Home() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="shell-main">
        <SkeletonPanel lines={5} label="Checking your session" />
      </div>
    );
  }
  if (!user) return <LandingPage />;
  return (
    <Shell>
      <ErrorBoundary key={user.business?.id ?? "home"}>
        <DashboardPage />
      </ErrorBoundary>
    </Shell>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route path="/pricing" element={<PricingPage />} />
      <Route path="/blog" element={<BlogLayout />}>
        <Route index element={<BlogIndex />} />
        <Route path="gst-filing-guide-india-2026" element={<GstFilingGuide />} />
        <Route path="hsn-code-lookup" element={<HsnCodeLookup />} />
        <Route path="gst-compliance-checklist-small-business" element={<GstComplianceChecklist />} />
      </Route>
      <Route path="/" element={<Home />} />
      <Route
        path="/invoices"
        element={
          <Protected>
            <InvoicesPage />
          </Protected>
        }
      />
      <Route
        path="/invoices/:id"
        element={
          <Protected>
            <InvoiceDetailPage />
          </Protected>
        }
      />
      <Route
        path="/upload"
        element={
          <Protected>
            <UploadPage />
          </Protected>
        }
      />
      <Route
        path="/reconcile"
        element={
          <Protected>
            <ReconcilePage />
          </Protected>
        }
      />
      <Route
        path="/itc"
        element={
          <Protected>
            <ITCPage />
          </Protected>
        }
      />
      <Route
        path="/filing"
        element={
          <Protected>
            <FilingPage />
          </Protected>
        }
      />
      <Route
        path="/suppliers"
        element={
          <Protected>
            <SuppliersPage />
          </Protected>
        }
      />
      <Route
        path="/alerts"
        element={
          <Protected>
            <AlertsPage />
          </Protected>
        }
      />
      <Route
        path="/usage"
        element={
          <Protected>
            <UsagePage />
          </Protected>
        }
      />
      {/* Behind `Protected` even though both probes it reads are public. They
          are public so an operator with no account can watch the queue; this
          page is for a signed-in business asking why its uploads are quiet,
          and putting it outside the shell would mean a nav-less page reachable
          from nowhere. */}
      <Route
        path="/status"
        element={
          <Protected>
            <StatusPage />
          </Protected>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
