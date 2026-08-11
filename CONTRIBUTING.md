# Contributing

## Workflow

Branch off `main`, open a pull request. CI runs lint, typecheck, tests and the
build - all four must pass before merge. Don't push to `main` directly.

```sh
git checkout -b feat/short-description
npm run lint && npm run typecheck && npm test -- --run && npm run build
```

## Conventions

- **Commit messages** are a single line, imperative: `fix: guard company fetch
  against a missing id`.
- **Types come from the database.** Never hand-edit
  `src/integrations/supabase/types.ts` - run `npm run gen:types` after any
  migration and commit the result. If you find yourself writing `as any` around a
  Supabase call, the generated types are stale; regenerate them instead.
- **Data fetching goes through TanStack Query hooks** in `src/hooks/queries/`.
  Don't add `useState` + `useEffect` fetching.
- **Forms use react-hook-form + zod**, with the schema in `src/lib/schemas/`
  shared between create and edit.
- **Colors come from tokens.** Use `text-primary`, `bg-muted`, the `--phase-*`
  variables - not `text-red-600`. Raw Tailwind palette colors break dark mode.

## Authorization

A client-side role check is a UI affordance, never a security boundary. Any new
table needs RLS enabled and explicit policies in the same migration that creates
it - a table with RLS off is world-writable through the public anon key. See
[DEVDOC.md](./DEVDOC.md#authorization-model).

## Tests

- Pure logic (`src/lib/**`) gets unit tests.
- Components and hooks get tests with Testing Library, with Supabase mocked at
  the HTTP layer by MSW.

Tests never touch the production database. The API tests run against a local
`supabase start` plus `supabase functions serve`, and skip themselves when that
stack is not up.
