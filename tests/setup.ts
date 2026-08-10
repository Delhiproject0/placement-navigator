import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeAll } from "vitest";

// The Supabase client throws at import time without these, and several modules
// import it transitively. Values are deliberately fake - nothing in the unit or
// component suites is allowed to reach the network.
beforeAll(() => {
  process.env.VITE_SUPABASE_URL ??= "https://test.supabase.co";
  process.env.VITE_SUPABASE_ANON_KEY ??= "test-anon-key";
});

afterEach(() => {
  cleanup();
});
