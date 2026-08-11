# PlaceTrack

Placement tracking for IIIT Hyderabad. Companies, schedules, eligibility, and the
interview experiences and questions students contribute after each drive.

**Live:** https://placements.dileepadari.dev

## What it does

- **Companies** - the drive calendar: registration deadlines, PPT / OA / interview
  slots, CGPA cutoffs, CTC breakdowns, roles, bond terms, and how many people were
  selected. Sortable and filterable, with imminent deadlines called out.
- **Interview experiences** - round-by-round writeups contributed by students who
  sat the drive, with difficulty, outcome, and tips.
- **Interview questions** - a question bank per company, tagged by topic and type.
- **Documents** - JDs, offer letters, OA question papers and feedback forms, stored
  on a self-hosted CDN (see [DEVDOC.md](./DEVDOC.md#file-storage)).
- **Roles** - `viewer` reads, `editor` maintains company data, `admin` also manages
  users. Enforced by Postgres row-level security, not just the UI.

## Stack

| | |
|---|---|
| Frontend | React 18, TypeScript, Vite, React Router 6 |
| UI | Tailwind CSS, shadcn/ui, Radix primitives |
| Data | Supabase (Postgres + PostgREST + GoTrue), TanStack Query |
| Forms | react-hook-form + zod |
| File storage | Self-hosted CDN at `mystorage.dileepadari.dev` via a Supabase Edge Function |
| Hosting | Vercel |

## Getting started

Requires Node 22+.

```sh
git clone git@github.com:Dileepadari/placement-navigator.git
cd placement-navigator
npm install
cp .env.example .env    # then fill it in - see below
npm run dev             # http://localhost:8080
```

### Environment

`.env` needs three browser-side values to run the app:

```sh
VITE_SUPABASE_PROJECT_ID="..."
VITE_SUPABASE_URL="https://<ref>.supabase.co"
VITE_SUPABASE_ANON_KEY="..."
```

The anon key is public by design - it ships in the JS bundle, and row-level
security is what actually protects the data. Three further values
(`SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_SERVICE_ROLE_KEY`)
are only needed to run migrations or deploy edge functions; they have no `VITE_`
prefix, so they are never bundled. [DEVDOC.md](./DEVDOC.md#environment) says where
each one comes from.

## Scripts

| Script | Does |
|---|---|
| `npm run dev` | Dev server on :8080 |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Unit and component tests |
| `npm run db:push` | Apply migrations to the linked project |
| `npm run gen:types` | Regenerate `src/integrations/supabase/types.ts` from the live schema |
| `npm run fn:deploy` | Deploy the `placements` edge function |

## Database

Migrations live in `supabase/migrations/` and are applied in filename order.
`supabase/backups/` holds data exports taken before schema changes.

```sh
npm run db:push      # apply to the linked project
npm run gen:types    # then always regenerate types
```

Never hand-edit `src/integrations/supabase/types.ts` - regenerate it. See
[supabase/README.md](./supabase/README.md) for how to add a migration safely.

## Contributing

Branch off `main`, open a PR. CI runs lint, typecheck, tests and the build; all
four must pass. See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

MIT
