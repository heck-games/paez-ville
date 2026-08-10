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
SHA=$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || date +%s)
sed -i '' "s/assets\/index-/assets\/index-$SHA-/g" "$DIST/index.html" || true
# actually Vite handles cache busting by putting hashes in filenames, so this is just extra safety, or we don't need it.
# Alberdi didn't use Vite, so it needed manual cache busting. Vite does it for us.

echo "==> Deploying to Pages project '$PROJECT'"
env -u CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID="$ACCOUNT_ID" \
  npx wrangler pages deploy dist \
    --project-name "$PROJECT" \
    --branch main \
    --commit-dirty=true

echo "==> Done. https://paezville.pages.dev (CNAME to paezville.heck.games needs to be configured in dashboard)"
