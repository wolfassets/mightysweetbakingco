# apps/web-a — Next.js (bundled API + frontend)

The "one-app" version. Next.js App Router with `app/api/*` route
handlers + the same UI as `web-b`. Runs on `:4000`.

## Stack

- Next.js 16 (App Router, Turbopack dev)
- Drizzle + `@libsql/client` (Turso)
- Tailwind, Geist + Bricolage fonts
- jsPDF, react-quill-new, react-day-picker, framer-motion

## Run

```bash
pnpm dev               # from this dir, or `pnpm dev:web-a` from repo root
```

No Redis required — this app talks to Turso directly via Drizzle. No
api/* validators are zod-checked (those live in `apps/api`).

## Why both web-a and web-b exist

- **web-a**: simpler — one process, one port, no CORS, no proxy. Easiest
  to deploy as a single Vercel app. Good for "MVP, one user, one host"
  shipping.
- **web-b + api**: cleaner separation — frontend ships dumb, all
  business logic on the backend. Future iOS / Android can share the
  same backend. Worth the extra moving parts when the team grows.

## Known issues (be careful)

### `src/db/index.ts:35` runs `void ensureDbInitialized()` at module load

With Next.js HMR, Turbopack re-evaluates the db module on every save.
That re-runs ~20 `ALTER TABLE IF NOT EXISTS` migrations, count queries,
and a 13-row sample insert. The Drizzle/libSQL client is re-created
each time. Old clients leak as in-flight request closures hold them.

Fix: store the client on `globalThis` so it survives HMR. Or just delete
the `ensureDbInitialized` call (tables already exist).

### Heavy module imports in `src/components/DeliveryDetail.tsx`

That file is 2,300 lines and imports jsPDF + Geist fonts (base64 TTFs)
+ Bricolage + react-quill-new + react-day-picker + framer-motion at
module level. Turbopack keeps the whole module graph hot.

Fix: lazy-load PDF + Quill behind `await import('./pdf-helper')` and
`<NotesEditor>` inside a `next/dynamic({ ssr: false })`.

### Schema duplication

`src/db/schema.ts` is a copy of `apps/api/src/db/schema.ts`. Both must
stay in sync — same Turso DB. Future consolidation: move to
`packages/schema/`.

## Endpoints

`app/api/*/route.ts` — REST routes that wrap Drizzle queries. Same
endpoints as `apps/api` but:

- Raw JSON responses (no `{data:T}` envelope)
- PUT instead of PATCH for updates
- DELETE takes id in body, not in path

These are kept for the standalone deployment scenario. If you only run
web-b + api, this directory is dead code.

## Production gaps

Same as web-b. See root `CLAUDE.md` "Production gaps". Plus:

- Bundled API routes inherit zero of the api app's protections (no rate
  limit, no idempotency, no audit log). Pick web-b + api for any
  multi-user prod deployment.
