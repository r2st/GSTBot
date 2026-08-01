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
  },
});
