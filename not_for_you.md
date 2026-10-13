# not_for_you.md

A personal working log. Not documentation, and nothing here is needed to use or
contribute to PlaceTrack. Everything a newcomer actually needs is in
[README.md](./README.md) and [DEVDOC.md](./DEVDOC.md).

---

## Sixty-three tests that had never run anywhere

`npx vitest run` reported **113 passed, 63 skipped** and had reported something
like that for as long as the API tests existed. Skipped is a colour the eye stops
reading after a while, so I went and looked at what was being skipped.

`tests/api` covers the authorization checks that replaced row-level security -
that one student cannot attach a file to another's write-up, that a viewer cannot
edit a contribution that is not theirs, that a revoked session stops working.
They skip themselves when nothing is listening on the local Supabase port, which
is the right behaviour for `npm test` on a laptop with no Docker running.

CI never started a stack. So the 63 tests guarding the most security-sensitive
code in the repository had **never executed on any machine except mine, and only
when I had happened to run `supabase start` first**. They were not failing. They
were not passing either. They were furniture.

I started the stack locally and ran them: all 63 pass, and 176/176 overall. Then
I added an `api` job to CI that runs `supabase start`, serves the function, polls
`/functions/v1/placements/health` until it answers, and runs `vitest run
tests/api`. It is slower than the other jobs by minutes, and it is the only job
whose failure would mean something is actually broken for a user.

The general shape of this, which keeps recurring across these repositories: **a
test that always skips is a file, not a test.** The signal it gives is
indistinguishable from the signal a deleted test gives, except that it takes up
space and makes the count look healthy.

One local run has failed twice now, once at the start of this work and once
again later the same day, and I have not managed to capture which test either
time - by the time I looked, the next run was green, and about twenty consecutive
runs since have all passed 176/176, including after a `supabase db reset`. So
there is something intermittent in here at roughly a one-in-ten rate and I do not
know what it is.

I have not papered over it with a retry, and I have not claimed to have fixed it.
Writing it down is the honest version: the `api` job now runs these on every push,
so the next occurrence will be in a CI log with a name attached, which is more
than I can produce by guessing.

## What the new CI job caught on its very first run

It failed, which is the best possible outcome for a job whose whole premise is
that nothing had been checking this.

`POST /auth/signup` returned 500 and every subsequent login returned 401. The
edge function log said:

```
DataError: Key length is zero
  at hmacKey (jwt.ts:25)
  at signJwt (jwt.ts:37)
  at issueSession (routes/auth.ts:26)
```

`PLACEMENTS_JWT_SECRET` was unset. `context.ts` read it as `?? ""`, the empty
string reached Web Crypto as a zero-length HMAC key, and `importKey` threw from
inside the sign path. Which means that in a deployment where that secret is
missing or misnamed, **every account on the site is broken and the only
symptom is an unexplained 500 on login.** Nothing says which variable, nothing
says it at startup, and the app looks fine until someone tries to sign in.

Two changes:

- `context.ts` now throws at module load if the secret is empty, naming the
  variable and both places to set it. The function refuses to boot rather than
  serving a broken login route. Verified by serving with the variable removed:
  `/health` returns 500 and the log carries the message, once, in English.
- The variable was **not in the Edge Function secrets table in DEVDOC**, which is
  how it went missing in the first place. It is now, along with the fact that a
  fresh checkout has to write `supabase/functions/.env` before the function will
  serve locally at all.

CI writes a throwaway secret for its own stack. It is in the workflow in plain
text on purpose: it signs tokens for a Postgres container that is destroyed
minutes later, and pretending otherwise by routing it through repository secrets
would suggest it is worth protecting.

Worth noticing that this was live-fire, not hypothetical. The job I added to stop
63 tests from silently skipping found a real hole in the deployment story on its
first execution.

## The committed `.env` that turned out not to matter

A `.env` was committed in `44b2fdb` and touched again in `5147a74`, and both
blobs are still reachable. That is normally the point where the day stops and
becomes a key rotation.

It is not, here. The only secret in it is `VITE_SUPABASE_ANON_KEY`, and decoding
the JWT payload gives `"role": "anon"`. That key is *designed* to be public - it
is compiled into the browser bundle on every deploy, so anyone with the site's
URL already has it. Publishing it changes nothing.

What would matter is if the anon key were load-bearing, and it is not:

- All 19 tables have RLS enabled, so the anon role reaches nothing by
  default.
- The browser does not talk to PostgREST at all. Every read and write goes
  through the edge function, which holds the service role key server-side and
  does its own authorization.

So: no rotation needed, no history rewrite needed, and I am recording the
reasoning here rather than in DEVDOC because the next person to find that blob
will have exactly the same jolt I did and deserves the two minutes back.

`.gitignore` now covers `.env.*` rather than the two specific names it used to
list, which had let `.env.local` and `.env.production` through - both of which
Vite reads happily.

## Small things I changed and would not put in DEVDOC

- **`timeout-minutes` on every job.** Nothing here has hung yet. Another
  repository in this sweep burned six hours of runner time on a job with no
  bound, which was enough to make me stop treating this as optional.
- **Actions bumped to `checkout@v5` / `setup-node@v5`.** v4 now emits a Node 20
  deprecation annotation on every run, and annotations that are always there are
  annotations nobody reads.
- **CI checks that `README-light.md` still matches `README.md`.** The light page
  is generated by `scripts/build-light-readme.mjs`, and a generated file that
  nothing verifies drifts silently the first time someone edits the source by
  hand.
- **Deleted `bun.lockb`.** Left behind by the Vite scaffold, untouched since the
  initial commit in December 2025, while `package-lock.json` has moved on and CI
  runs `npm ci`. A second lockfile that nobody updates is not inert: it tells the
  next person, and any tooling that sniffs for one, to install a dependency tree
  that has not existed for months.
- **Removed `public/__capture.html`.** That was my screenshot harness, an iframe
  pinned to an exact viewport with scrollbars hidden. It has no business shipping
  in `public/`, where Vite would have copied it straight into the build.
- **`hsl(var(--...))` cannot be handed to Recharts.** Already fixed before this
  pass, but worth restating because the failure mode is nasty: Recharts writes
  colours into SVG presentation attributes, where `var()` does not resolve, so
  the marks get an invalid fill and are drawn invisibly with correct axes and no
  console error. It looks exactly like the data never arrived.

## Screenshots

Eighteen images: six pages in dark, the same six in light, three responsive
widths in each theme. All of them are real renders against a **local** stack
seeded from `supabase/seed.sql`, signed in through the app's own login form as
`student@iiit.ac.in`. Nothing points at the hosted project and no real person's
data appears in any of them.

The responsive ones are individual screens at 390px and 820px, not a composite
strip, and the scrollbars are suppressed in the capture rather than cropped out
afterwards - a cropped scrollbar leaves a pale seam down the edge that is obvious
once you have seen it.

Compressed 2.38 MB down to 0.53 MB with a 128-colour palette quantise and no
dithering. Dithering is what makes quantised screenshots look like they were
faxed; without it, text stays crisp because UI screenshots have very few distinct
colours to begin with.
