#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/home/ubuntu/services/mightysweet}"

cd "$APP_DIR"

echo "==> node: $(hostname)"
echo "==> app dir: $APP_DIR"

if ! command -v pnpm >/dev/null 2>&1; then
  corepack enable
  corepack prepare pnpm@11.5.3 --activate
fi

echo "==> installing dependencies"
pnpm install --frozen-lockfile

echo "==> building api"
pnpm --filter @mightysweet/api build

echo "==> building web-c css"
pnpm --filter @mightysweet/web-c build:css

echo "==> restarting services"
sudo systemctl restart msc-api
sudo systemctl restart web-c

echo "==> checking local api health"
curl -fsS --retry 20 --retry-delay 1 --retry-connrefused http://127.0.0.1:3000/health >/dev/null

echo "==> checking local web-c health"
curl -fsS --retry 20 --retry-delay 1 --retry-connrefused http://127.0.0.1:4002/_health >/dev/null

echo "==> deploy complete"
