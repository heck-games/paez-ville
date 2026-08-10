#!/usr/bin/env bash
# Páez Ville — Cloudflare Pages deploy (Direct Upload).
#
# Hardens against the 2026-07/08 cache landmines documented in
# ~/.claude/skills/cloudflare-free-deploy:
#   1. document = no-store (never no-cache alone)
#   2. /assets/* short revalidate TTL — NEVER immutable on SPA Pages
#   3. stamp entry bundle URL with ?v=<git-sha> even though filename is hashed
#   4. visible build stamp in index.html for "did the user get the new build?"
#   5. post-deploy Playwright against BOTH pages.dev AND custom domain (pinned)
#
# Usage: npm run deploy
set -euo pipefail

PROJECT="paezville"
ACCOUNT_ID="c4dba63a117f3500cebc9b091759bb16"
CUSTOM_HOST="paezville.heck.games"
PAGES_HOST="paezville.pages.dev"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="$ROOT/dist"
SHA="$(git -C "$ROOT" rev-parse --short HEAD)"

echo "==> Building Vite bundle into dist/ (sha=$SHA)"
cd "$ROOT"
npm run build

# --- _headers: document no-store; assets short revalidate (NOT immutable) ---
cat > "$DIST/_headers" <<'HDR'
/*
  Cache-Control: no-store

/assets/*
  Cache-Control: public, max-age=300, must-revalidate

/maps/*
  Cache-Control: public, max-age=300, must-revalidate
HDR

# --- Stamp entry script with ?v=<sha> so a poisoned edge key can't stick ---
python3 - "$DIST/index.html" "$SHA" <<'PY'
import re, sys
path, sha = sys.argv[1], sys.argv[2]
html = open(path, encoding="utf-8").read()
out, n = re.subn(r'(src="\./assets/[^"?]+\.js)"', rf'\1?v={sha}"', html)
if n != 1:
    sys.exit(f"expected 1 entry script rewrite, found {n}")
# Inject a tiny window.__PAEZ_BUILD for the in-game stamp
if "__PAEZ_BUILD" not in out:
    out = out.replace(
        "</head>",
        f'<script>window.__PAEZ_BUILD="{sha}";</script>\n  </head>',
        1,
    )
open(path, "w", encoding="utf-8").write(out)
print(f"  stamped index.html with ?v={sha}")
PY

echo "==> Deploying to Pages project '$PROJECT'"
# Prefer wrangler OAuth (env -u CLOUDFLARE_API_TOKEN so a stale file token can't win)
env -u CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID="$ACCOUNT_ID" \
  npx wrangler pages deploy "$DIST" \
    --project-name "$PROJECT" \
    --branch main \
    --commit-dirty=true

echo "==> Waiting ~35s for multi-POP propagation..."
sleep 35

# --- Verify without trusting local DNS (pin to zone edge IP) ---
IP="$(dig +short heck.games @1.1.1.1 | head -1)"
echo "==> Edge pin IP=$IP"

verify_html() {
  local host="$1"
  local body
  body="$(curl -sS --resolve "${host}:443:${IP}" "https://${host}/?x=$RANDOM")"
  local size="${#body}"
  if [[ "$size" -lt 200 ]]; then
    echo "✗ $host returned tiny body ($size bytes)" >&2
    return 1
  fi
  if ! grep -q "$SHA" <<<"$body"; then
    echo "✗ $host HTML missing build stamp $SHA (stale POP?)" >&2
    echo "  first 200 chars: ${body:0:200}" >&2
    return 1
  fi
  echo "  ✓ $host HTML has build $SHA (size=$size)"
}

verify_html "$PAGES_HOST" || true
verify_html "$CUSTOM_HOST" || true

echo "==> Playwright live gate (pages.dev)"
PV_VALIDATE_URL="https://${PAGES_HOST}/" npm run validate

echo "==> Done."
echo "    pages.dev : https://${PAGES_HOST}/"
echo "    custom    : https://${CUSTOM_HOST}/"
echo "    build     : ${SHA}"
echo ""
echo "If custom domain fails DNS on this machine:"
echo "  dig +short ${CUSTOM_HOST} @1.1.1.1"
echo "  # Tailscale/ISP may cache NXDOMAIN for SOA MINIMUM (1800s)."
echo "  # Verify with: curl --resolve ${CUSTOM_HOST}:443:${IP} https://${CUSTOM_HOST}/"
echo "  # See skill dns-propagation-debug."
