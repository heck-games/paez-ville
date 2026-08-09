# Páez Ville

Top-down/overhead history+dialogue RPG (GBC/GBA era). Standalone — own repo, own subdomain
(`paezville.heck.games`), no shared save with Alberdi. **Always spell it Páez (`à`).**

## Layout

```
index.html              — entry, loads /src/main.js
src/main.js             — Phaser 4 config (240×160, FIT+CENTER, Arcade physics)
src/scenes/             — BootScene, WorldScene (walkable map+player), (BattleScene P5)
src/makeTileset.js      — programmatic tileset texture (no PNG art needed for P1)
public/maps/            — Tiled JSON maps (isla.json, cerveceria.json, cancha.json)
js/                     — ported dialogue.js (from Alberdi) + game logic modules
assets/sprites/         — RD-generated sprite sheets (player, npcs, enemies, boss)
assets/tiles/           — tile art
assets/audio/           — chiptune (numpy synth via scripts/gen_audio.py)
scripts/                — pipeline: gen_sprites_rd.py, rd_keys.py, audit_sheets.py, validate.mjs
rooms-worker/           — (post-0.1) multiplayer DO relay, ported from Alberdi
functions/api/          — (post-0.1) Pages Functions (config, etc.)
config/rd-keys.json     — RD key rotation ledger (GITIGNORED — contains tokens)
rd-cache/               — content-hash cache for RD outputs (GITIGNORED)
docs/PLAN.md            — the phased implementation plan
docs/STORY.md           — the happy-path story stub (rewritten after v0.1)
```

## Commands

```bash
npm run dev        # Vite dev server on :5173
npm run build      # production build → dist/
npm run validate   # Playwright gate: boots, canvas, no console errors, movement
python3 scripts/gen_sprites_rd.py --spec player --check-cost   # RD dry-run (free)
python3 scripts/gen_sprites_rd.py --spec player                # RD real fire
python3 scripts/audit_sheets.py <sheet.png>                 # sprite QA gate
python3 scripts/rd_keys.py balances                         # key rotation ledger
```

## Engine & stack

- **Phaser 4 + Vite + Tiled JSON + rexVirtualJoystick**, code-first (no editor, no MCP).
  Agent edits source directly — that's why code-first was chosen over Kaplay/etc.
- Base resolution **240×160 (GBA)**, integer-scaled via `Scale.FIT`.
- **Argentine Spanish** UI throughout.
- Reuses from `../calles-de-alberdi`: `js/dialogue.js` (crown jewel), RD sprite pipeline,
  `audit_sheets.py`, numpy chiptune `gen_audio.py`, deploy+cache pattern. Does NOT reuse
  Alberdi `blocks` level format (→ Tiled) or belt-scroll combat.

## Invariants (don't violate)

- **Name:** Páez Ville with `à`. Never "Paes", never "Páez" for the game title.
- **Real references are mandatory.** Any historical fact an NPC states, a sign shows, or a map
  detail implies MUST match [`docs/REFERENCES.md`](./docs/REFERENCES.md) (verified Córdoba /
  Villa Páez / Alberdi sources). Flavor, names, personalities = fiction and fine; dates, place
  names, brands, founding events = real and must be accurate. The Río Suquía is the geographic
  spine (Villa Páez borders it; Isla de los Patos sits in it; the brewery stood on its bank).
- **RD keys:** rotate via `scripts/rd_keys.py next_token()`; never commit tokens; balance is TRUTH
  (not credits); treat budget as `balance - 0.01` (float precision refuses balance==cost calls).
- **NEVER overwrite a generated asset** (global rule). Use the no-clobber helper; suffix `_r2`.
- **Combat has two registers** — staff-on-the-go (no transition) vs turn-based (world stops).
  Don't blur them. See docs/PLAN.md §4-5.
- **Saves:** localStorage first (v0.1). D1 is post-0.1.
- **Multiplayer:** deferred past v0.1 (feasible — see docs/PLAN.md).
- No magic numbers — tuning in a constants module.

## Deployment (post-build)

Cloudflare Pages project `paezville`, subdomain `paezville.heck.games` (CNAME → pages.dev).
R2 public bucket for sprite/tile assets (long immutable TTL). Pin `CLOUDFLARE_ACCOUNT_ID`
(c4dba63a…). `no-store` document + `?v=sha` subresources + visible build stamp (same pattern as Alberdi).
