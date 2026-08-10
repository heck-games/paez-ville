#!/usr/bin/env bash
set -euo pipefail

PROJECT="paezville"
ACCOUNT_ID="c4dba63a117f3500cebc9b091759bb16"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="$ROOT/dist"

echo "==> Building Vite bundle into dist/"
cd "$ROOT"
npm run build

# Stamp asset URLs with current commit so browser caches are busted
# Vite automatically generates content-hashed filenames in dist/ (e.g. index-DGsbhirc.js) for cache busting.

echo "==> Deploying to Pages project '$PROJECT'"
env -u CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID="$ACCOUNT_ID" \
  npx wrangler pages deploy dist \
    --project-name "$PROJECT" \
    --branch main \
    --commit-dirty=true

echo "==> Done. https://paezville.pages.dev (CNAME to paezville.heck.games needs to be configured in dashboard)"
