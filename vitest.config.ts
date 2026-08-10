import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    // Set here rather than relying on a local .env, so CI (which has none)
    // behaves identically. The client module throws without them.
    env: {
      VITE_SUPABASE_URL: "https://test.supabase.co",
      VITE_SUPABASE_ANON_KEY: "test-anon-key",
      VITE_SUPABASE_PROJECT_ID: "test",
    },
    include: ["tests/**/*.test.{ts,tsx}"],
    // Playwright specs live under e2e/ and are driven by their own runner.
    exclude: ["e2e/**", "node_modules/**"],
    coverage: {
      provider: "v8",
      include: ["src/lib/**", "src/hooks/**"],
      reporter: ["text", "html"],
    },
  },
});
