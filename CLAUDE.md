# CLAUDE.md — Mighty Sweet monorepo

This is the operational guide for Claude Code (and humans) working in this
repo. Read it before doing anything that touches the filesystem at scale.

---

## Layout

```
mightysweetcookies/                  ← monorepo root (git lives here)
├── apps/
│   ├── web-a/   Next.js with bundled API routes (port 4000)
│   │            - All UI lives here. Hits Turso directly via Drizzle.
│   │            - Use this when you want the simpler "one app" experience.
│   ├── web-b/   Next.js frontend only (port 4001)
│   │            - Same UI as web-a, but `app/api/*` deleted.
│   │            - `src/lib/api.ts` patches window.fetch to proxy
│   │              `/api/*` → http://localhost:3000 (msc-api Hono).
│   ├── api/     Hono backend (port 3000)
│   │            - Serves web-b. Hits Turso + Redis.
│   │            - Validators in src/validators/, routes in src/routes/.
│   └── ios/     SwiftUI iOS companion (Xcode project)
│                - Hits Turso directly (not through msc-api).
│                - Swift models mirror Drizzle schema manually.
│
├── legal/       LaTeX source + rendered PDFs for customer contracts + invoice
│
├── docs/        Architecture notes, typography preview, this CLAUDE.md
│
├── archive/     Old/unused files (cookies.db, serve.py, …)
│
├── package.json            root: dev:api / dev:web-a / dev:web-b scripts
├── pnpm-workspace.yaml     workspaces: apps/web-a, apps/web-b, apps/api
└── .gitignore
```

Database: shared dev fork on Turso (`mighty-sweet-dev-bhatnag8`). Same `.env`
values across web-a, api, and ios. **Three frontends, one DB.**

---

## How to run things

Only run ONE Next.js dev server at a time on a 16 GB Mac. Turbopack pins
~1 GB per dev server + the api is ~150 MB. With both Next servers running
plus Chrome / Discord / VS Code you'll start swapping.

```
pnpm dev:api          # Hono on :3000
pnpm dev:web-a        # Next.js with bundled API on :4000 (standalone)
pnpm dev:web-b        # Next.js proxying to api on :4001
```

Do NOT run more than one of web-a / web-b at the same time. The api is fine
to leave running alongside web-b.

Redis must be running for the api to boot (`redis-cli ping` → `PONG`). The
SSE subscription on startup will fail-fast if Redis isn't reachable.

---

## ⚠️ HARD-LEARNED LESSON: don't `ditto` folders containing `node_modules`

**What happened on 2026-05-12:**

While restructuring this repo into the monorepo layout, Claude ran three
`ditto -rsrc` commands to copy folders into `apps/`. Each source folder
contained a `node_modules/` directory.

- Total files moved through ditto: **46,357** (39,107 in the frontend
  source alone — almost all of that is `node_modules/`).
- Per the kernel's own diagnostic
  (`/Library/Logs/DiagnosticReports/ditto_2026-05-12-170322_*.diag`):
  **9,105 MB of file-backed memory dirtied in 66 minutes.**
- macOS has a per-resource-coalition rolling cap of **2,147 MB / 24h** on
  file-backed dirty pages. It blew past 4× that.
- Kernel started throttling I/O on the VS Code coalition (Claude Code is
  parented to VS Code).
- WindowServer's HID event queue starved at 17:01:52 → desktop froze for
  6.27s → bluetoothd, ScreenTimeAgent, Spotify all faulted at 17:02:25 →
  user had to hard-reboot.

**Root cause:** `ditto -rsrc` faithfully copies every file in the source
tree, including all the symlinks + tiny files inside `node_modules/`. Each
file becomes a file-backed mmap'd page in the kernel's unified buffer cache.
Thousands of files = thousands of dirty pages. The kernel counts that
against the 24h disk-writes cap.

**Rules for moving folders in this repo (or any node project):**

1. **`mv` for same-disk operations.** `mv` is an O(1) inode rename. No bytes
   get written. Always preferred when moving within the same filesystem.
2. **If you must copy across disks:** delete `node_modules/`, `.next/`,
   `dist/`, `.turbo/`, `build/`, and any other build artifacts FIRST. Then
   copy the slim source. Reinstall deps at the destination.
3. **For copying source-only:** `tar -C src -cf - --exclude=node_modules
   --exclude=.next . | tar -C dst -xf -` works and is far lighter than
   `ditto`. Or use `rsync --exclude=node_modules` (rsync dedupes via
   hashes — kinder to the page cache).
4. **Never use `ditto -rsrc` on a folder containing `node_modules/`.** The
   `-rsrc` flag also copies resource forks + extended attributes, which is
   slow even before you add 30k tiny files.
5. **After any mass `rm -rf node_modules/`:** the kernel will log a
   resource-coalition event too if the cap is breached. Same fix — be slim.

**If you've already breached the cap:**
- The 24h rolling window will reset automatically.
- A reboot also resets the counter.
- Until then, avoid further heavy disk operations from the same coalition.

---

## What's still TODO in the migration

- [ ] Schema extraction: `apps/web-a/src/db/schema.ts` and
      `apps/api/src/db/schema.ts` are duplicates. Move to
      `packages/schema/` and have both apps import from it.
- [ ] Validators package: `apps/api/src/validators/` could become
      `packages/validators/` and be reused by web-a's API routes.
- [ ] `apps/web-a/src/db/index.ts:35` runs `void ensureDbInitialized()` at
      module load. In Next.js dev with HMR this re-evaluates on every save,
      re-running ~20 ALTER TABLE migrations + a sample-data insert. Make it
      run-once via `globalThis` sentinel or just delete it (tables already
      exist).
- [ ] Pin Drizzle + @libsql/client to the same versions across web-a and
      api. Today: web-a is 0.45.1 / 0.17.0, api is 0.38.3 / 0.14.0. Same
      DB, so column drift would be silent.
- [ ] `apps/web-a/src/components/DeliveryDetail.tsx` is 2,300 lines and
      imports jsPDF + Geist fonts + Bricolage + react-quill-new +
      react-day-picker + framer-motion at module level. Lazy-load PDF +
      Quill behind dynamic imports to drop dev-mode RAM ~30%.

---

## Production gaps (do NOT deploy without)

1. **No auth.** Clerk middleware is a no-op setting `userId='local-dev'`.
   Reinstate before going public.
2. **No HTTPS.** Add a reverse proxy (Cloudflare / Caddy / nginx).
3. **No body-size limit.** A malicious POST can OOM the api.
4. **Dev Turso credentials are in `apps/*/`.env*` files.** Move to a
   secret manager at deploy time.
5. **`tsx watch` is the api's dev runner.** Build to `dist/` + run
   `node dist/index.js` in prod.
6. **CORS allowlist is localhost-only.** Add prod frontend origin to
   `CORS_ORIGINS` env var.
7. **12 frontend fetch sites swallow errors silently** (audit identified).
   They `setX(await res.json())` without `res.ok` checks; error envelopes
   crash downstream `.filter()` / `.map()` calls.
8. **No `AbortController`, no `Idempotency-Key`** on mutations. Double
   clicks duplicate POSTs.

---

## Files of note

- `apps/api/src/db/indexes.ts` — runs `CREATE INDEX IF NOT EXISTS` on boot.
- `apps/api/src/middleware/auth.ts` — currently a no-op (Clerk stripped).
- `apps/api/src/middleware/rate-limit.ts` — bypasses in dev
  (`NODE_ENV !== production`).
- `apps/api/src/middleware/idempotency.ts` — only caches 2xx responses.
- `apps/web-b/src/lib/api.ts` — fetch-proxy that translates Next-style
  `/api/X?id=Y` calls → msc-api's `/X/Y` + unwraps `{data:T}` envelope.
- `apps/web-b/app/ApiBridge.tsx` — installs the fetch proxy at layout
  level.
- `apps/ios/CLAUDE.md` — iOS-side parity notes.

---

## Smoke tests

```bash
# Backend
curl -s http://localhost:3000/health | jq .
curl -s http://localhost:3000/flavors | jq '.data | length'
curl -s http://localhost:3000/openapi.json > /dev/null && echo "OpenAPI OK"

# Frontends
curl -sI http://localhost:4000/ | head -1   # web-a
curl -sI http://localhost:4001/ | head -1   # web-b
```

A full smoke-test shell script lives at `scripts/smoke-test-api.sh` (TODO:
move from earlier audit output).
