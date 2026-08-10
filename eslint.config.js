import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    // supabase/** is Deno, not browser TypeScript: different globals, different
    // module resolution, and `deno check` in CI is what actually typechecks it.
    // .temp is scratch the CLI regenerates on every start.
    ignores: ["dist", "coverage", "playwright-report", "test-results", "supabase/**"],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      // Was "off", which is how the dead imports and the unused formatDate
      // helper survived. Underscore-prefixed names stay exempt for the
      // intentionally-ignored-argument case.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  {
    // shadcn/ui primitives are vendored, near-verbatim upstream code. Holding
    // them to our rules means editing files we want to keep diffable against
    // upstream, so only the genuinely dangerous rules apply here.
    files: ["src/components/ui/**/*.{ts,tsx}", "src/hooks/use-toast.ts", "src/hooks/use-mobile.tsx"],
    rules: {
      "react-refresh/only-export-components": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
);
