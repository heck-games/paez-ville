#!/usr/bin/env bash
# Deploy Páez Ville to Cloudflare Pages -> https://paezville.heck.games
#
# Account id is pinned on purpose: wrangler otherwise falls back to a cached
# account from a different Cloudflare login. CLOUDFLARE_API_TOKEN is unset so the
# wrangler OAuth session is used.

set -euo pipefail

PROJECT="${PROJECT:-paezville}"
ACCOUNT_ID="c4dba63a117f3500cebc9b091759bb16"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> Building production bundle"
cd "$ROOT"
npm run build

echo "==> Deploying to Cloudflare Pages project '$PROJECT'"
env -u CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID="$ACCOUNT_ID" \
  npx wrangler pages deploy dist \
    --project-name "$PROJECT" \
    --branch main \
    --commit-dirty=true

echo "==> Done. https://paezville.heck.games"
