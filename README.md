# Mighty Sweet Cookies — monorepo

Three frontends, one backend, one database.

| App | Path | Port | Stack | Purpose |
|---|---|---|---|---|
| **web-a** | `apps/web-a/` | 4000 | Next.js (App Router) + Drizzle | One-app version. Bundled API routes hit Turso directly. |
| **web-b** | `apps/web-b/` | 4001 | Next.js (App Router) | Same UI as web-a, but `app/api/*` is gone. A fetch-proxy in `src/lib/api.ts` rewrites every `/api/*` call to the Hono backend at :3000. |
| **api** | `apps/api/` | 3000 | Hono + Drizzle + Redis | Standalone REST + SSE service. Serves web-b. |
| **ios** | `apps/ios/` | n/a | SwiftUI + Xcode | Native iOS app. Talks to Turso directly (raw SQL via `/v2/pipeline`). |

```
                              ┌─────────────┐
                  web-a ──────│   Turso     │
                              │   libSQL    │
                  ios ────────│ (shared DB) │
                              └──────┬──────┘
                                     ▲
                                     │ Drizzle
                                     │
                              ┌──────┴──────┐
                  web-b ──────│ Hono :3000  │
                  (proxy)     │  + Redis    │
                              └─────────────┘
```

## Quick start

```bash
pnpm install                  # one install, dedups across all apps

pnpm dev:api                  # Hono on :3000 (needs Redis)
pnpm dev:web-a                # Next.js bundled on :4000   (pick ONE web)
pnpm dev:web-b                # Next.js split on :4001     (pick ONE web)
```

Redis must be running: `redis-cli ping` → `PONG`. If not:
```bash
brew services start redis
```

**Don't run web-a AND web-b at the same time.** 16 GB Macs can't carry two
Turbopack dev servers + Chrome + IDE. Pick one.

## Repo layout

```
.
├── apps/                                # deployable apps (workspaces)
│   ├── web-a/   bundled Next.js          (Drizzle direct → Turso)
│   ├── web-b/   split Next.js            (fetch proxy → apps/api)
│   ├── api/     Hono backend             (Drizzle → Turso, Redis)
│   └── ios/     SwiftUI Xcode project    (raw SQL → Turso)
│
├── legal/                                # LaTeX contract + invoice template
├── docs/                                 # architecture notes, typography preview
├── archive/                              # old/unused files (cookies.db, …)
├── scripts/                              # one-off utility scripts
│
├── CLAUDE.md             ← read this before doing anything destructive
├── AGENTS.md             ← rules for AI agents working in this repo
├── package.json
├── pnpm-workspace.yaml
└── .gitignore
```

## Database

Shared dev fork on Turso: `mighty-sweet-dev-bhatnag8`.

All three apps (web-a, api, ios) point at the same DB. Schema lives in
three places today (Drizzle TS × 2 + Swift × 1) — drift is possible. See
`CLAUDE.md` "What's still TODO" for the consolidation plan.

## Production

Not ready. See `CLAUDE.md` "Production gaps" section — auth is stripped,
no TLS, no rate-limit-in-dev, etc.

## See also

- `CLAUDE.md` — operational guide + the disk-writes incident from 2026-05-12.
- `AGENTS.md` — agent etiquette (don't spawn 10 in parallel; don't `ditto` node_modules).
- `apps/ios/CLAUDE.md` — iOS-specific notes.
