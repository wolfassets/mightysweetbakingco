# Mighty Sweet Cookies — API

Standalone Hono REST + SSE backend. Runs on port 3000. Talks to a remote Turso DB
and a local Redis cache.

## Quick start (local)

```bash
cp .env.example .env   # fill in Turso URL + auth token
npm install
npm run dev            # tsx watch on :3000
```

Requires a Redis instance reachable via `REDIS_URL`. For dev:
```bash
brew services start redis
```

## Production / Docker

```bash
docker compose up -d --build
```

Compose brings up:
- `msc-redis` — Redis 7 (alpine), persistent volume
- `msc-api`   — this service, built from the local Dockerfile

The api joins two networks: an internal `msc` network with Redis, and the
external `nginx-proxy-manager_default` network so the host's NPM can reach
it as `msc-api:3000` for TLS termination.

Set up a proxy host in NPM:
1. Open `http://<vm>:81`
2. Hosts → Proxy Hosts → Add Proxy Host
3. Domain: `api.mightysweetbakingco.com`
4. Forward to: `msc-api` port `3000`
5. SSL tab → request Let's Encrypt cert, force SSL

## Endpoints

REST under `/`. OpenAPI spec at `/openapi.json`. Swagger UI at `/docs`. SSE at
`/stream`. Health probe at `/health`.

## Env vars

See `.env.example` — every var is documented inline.
