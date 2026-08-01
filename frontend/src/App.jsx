import { Navigate, Route, Routes } from "react-router-dom";
import Shell from "./components/Shell";
import { useAuth } from "./hooks/useAuth";
import DashboardPage from "./pages/DashboardPage";
import InvoiceDetailPage from "./pages/InvoiceDetailPage";
import InvoicesPage from "./pages/InvoicesPage";
import LoginPage from "./pages/LoginPage";
import UploadPage from "./pages/UploadPage";

function Protected({ children }) {
  const { user, loading } = useAuth();
  // Waiting on /auth/me — rendering the redirect now would bounce a signed-in
  // user to the login page on every refresh.
  if (loading) return <p className="muted centered">Loading…</p>;
  if (!user) return <Navigate to="/login" replace />;
  return <Shell>{children}</Shell>;
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
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
