import { Navigate, Route, Routes } from "react-router-dom";
import ErrorBoundary from "./components/ErrorBoundary";
import Shell from "./components/Shell";
import { SkeletonPanel } from "./components/Skeleton";
import { useAuth } from "./hooks/useAuth";
import DashboardPage from "./pages/DashboardPage";
import FilingPage from "./pages/FilingPage";
import InvoiceDetailPage from "./pages/InvoiceDetailPage";
import InvoicesPage from "./pages/InvoicesPage";
import ITCPage from "./pages/ITCPage";
import LoginPage from "./pages/LoginPage";
import ReconcilePage from "./pages/ReconcilePage";
import SuppliersPage from "./pages/SuppliersPage";
import UploadPage from "./pages/UploadPage";

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
  if (!user) return <Navigate to="/login" replace />;
  // The boundary sits inside the Shell rather than around it, so a page that
  // crashes leaves the navigation intact and the user can click away from it.
  return (
    <Shell>
      <ErrorBoundary>{children}</ErrorBoundary>
    </Shell>
  );
}

export default function App() {
  const { user, loading } = useAuth();

  return (
    <Routes>
      <Route
        path="/login"
        element={loading ? null : user ? <Navigate to="/" replace /> : <LoginPage />}
      />
      <Route
        path="/"
        element={
          <Protected>
            <DashboardPage />
          </Protected>
        }
      />
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
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
