// defineConfig comes from vitest/config, not vite: the plain vite helper does
// not carry the `test` key through, which leaves the suite running in the
// default node environment with no DOM and no localStorage.
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Proxy /api to the FastAPI backend during development, so the app talks
    // to a same-origin path and CORS never enters the picture locally.
    proxy: {
      "/api": { target: "http://localhost:8000", changeOrigin: true },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.js",
    css: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.{js,jsx}"],
      exclude: [
        "src/**/*.test.{js,jsx}",
        "src/test/**",
        // The entry point is three lines of createRoot with nothing to assert
        // that rendering the app in a test does not already assert.
        "src/main.jsx",
      ],
      // A ratchet against tests being deleted or a component landing with
      // none — not a target to code towards. Raise it in the commit that
      // earns it, the same way backend/pyproject.toml does.
      //
      // `functions` still sits below the rest, for the reason it always has:
      // v8 counts every inline JSX arrow as its own function, so a component
      // whose lines are fully covered still scores well under 100 when it
      // renders a row of handlers that no single test clicks. Statements and
      // lines remain the honest signal.
      //
      // It moved 87 → 95 when the flow tests landed. Driving the app across
      // pages clicks the handlers a page mounted on its own never gets asked
      // to — the measured figure went from the high eighties to 97 — and the
      // gate follows what the suite now actually reaches, with the same kind
      // of headroom the other three keep.
      //
      // `branches` is at 99.5 rather than at the 99.81 actually measured, and
      // the gap is deliberate. Three branches are unreachable by construction
      // and are left in as guards rather than deleted:
      //
      //   * InvoiceDetailPage's `draft[field] ?? ""` — `adopt` already
      //     coerces every field, and the form does not render without an
      //     invoice.
      //   * validate.js's `Number.isFinite(value) ? value : null` — a field
      //     the amount check let through is finite by then.
      //   * ReconcilePage's `|| "Could not load this period."` — every
      //     rejection this page can see is raised by `lib/api.js`, and since
      //     `errorMessage` stopped being able to produce a blank line there is
      //     no API failure left with an empty message. It now answers a
      //     rejection from somewhere else, which is why it stays.
      //
      // A gate at the measured figure would make removing any of those guards
      // the way to keep CI green.
      thresholds: { statements: 99, branches: 99.5, functions: 95, lines: 99 },
    },
  },
});
