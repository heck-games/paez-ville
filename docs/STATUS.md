# Páez Ville — STATUS (read this first)

> Updated **2026-08-09**. For the next agent: start here, then `docs/PLAN.md`, then code.

## Live URLs

| URL | State |
|---|---|
| **https://paezville.pages.dev** | Production Pages — **authoritative** until custom-domain DNS is stable in the client's resolver |
| **https://paezville.heck.games** | Custom domain on CF Pages project `paezville`. DNS CNAME → `paezville.pages.dev` (proxied) **exists** in the **darkscale** CF zone `heck.games`. Some local resolvers briefly NXDOMAIN; auth NS `elisa.ns.cloudflare.com` always answers `172.64.80.1`. Force-resolve to validate. |
| GitHub | `heck-games/paez-ville` (submodule of `heck` at `games/paez-ville`) |
| Tag | `v0.1` (scaffold). Next meaningful tag: `v0.1.1` after this happy-path wiring ships. |

## What actually works (verified on the wire 2026-08-09)

`npm run validate` (Playwright → vite preview) is **green**:

- Canvas + `__PAEZ` hook, movement Δx ≥ 5
- Dialogue open/close (plain lines)
- Staff combat despawns a trash dog (Zelda register, no menu)
- Turn battle starts, boss HP drops, returns to world with `bossDefeated`
- Map hop `isla → cerveceria → cancha → isla`
- localStorage save/load/clear via `js/save.js` key `paez_ville_save_v1`

Happy-path **in-game** (not only hooks):

1. Talk to **don Tito** on Isla (branched dialogue, real refs from `docs/REFERENCES.md`)
2. Staff the **perros** near the duck spawn
3. Walk the gold exit marker → **cerveceria**
4. Walk into **El Cervecero** → taunt → fade → turn battle → win → back on dock with flag set
5. Exit → **cancha** → step the `finish_v01` trigger → ending lines + save

## What was broken / what we fixed (the post-mortem)

Earlier sessions declared "v0.1 complete" while several systems were **hook-only**:

| Failure | Root cause | Fix |
|---|---|---|
| Custom domain "dead" | Local resolver NXDOMAIN intermittently; CF DNS + Pages custom domain are fine | Document force-resolve; keep `pages.dev` as the CI URL |
| Empty-looking game | Procedural tiles only + cropped RD sheets — it *is* rendering (green grass + path), just bare | Accept for v0.1.1; real tiles are post-0.1 art |
| Boss never fought | `type:"boss"` POI ignored; only `__PAEZ.triggerBossBattle()` worked | Spawn boss sprite, proximity + interact → taunt → `BattleScene` |
| Battle win lost | `BattleScene.victory()` did `scene.start('World')` with **no** `bossDefeated` | Pass `{ bossDefeated: true, mapKey, spawnX/Y }` |
| Exit ping-pong | Restart dropped player on the reverse exit | `EXIT_LANDINGS` + `exitCooldown` |
| Save forked | `WorldScene` used `paez_ville_save_v0.1`, `js/save.js` used `v1` | Single module, key `paez_ville_save_v1` |
| Absolute asset paths | `BootScene` loaded `/maps/...` while Vite `base:'./'` | Relative `maps/...`, `assets/...` |
| Dialogue branch stuck open | `selectChoice` left `active=true` and nested `show()` raced | Close box before emitting `dialogue_choice` |
| cerveceria/cancha no collision | tileset missing `collides` props | Copied from `isla.json` |
| Validator false reds | Branched dialogue never "closes"; battle fade 220ms; map order after battle | Plain-line dialogue test; wait 600ms; reset to isla first |

## Account / deploy landmines (heck.games)

- **CF account for Pages deploys:** `c4dba63a…` (**Darkscalegeler**). Pin `CLOUDFLARE_ACCOUNT_ID`. Wrangler OAuth session deploys here.
- **CF account for the `cloudflare-pages-token` Keychain entry:** **Cooper** account — can list Cooper Pages, **cannot** touch darkscale Pages/DNS. Do not use it for `paezville`.
- **DNS token that works:** Keychain `cloudflare-darkscale-ops` — zone edit on `heck.games` (id `3d5c0405709f17ae19895d1eeb33dea1`).
- **Porkbun** holds the registrar; NS are Cloudflare (`elisa`/`ian`). Porkbun API only shows parking ALIAS/CNAME — **not** the live zone. Edit DNS via CF API, not Porkbun.
- Deploy script: `scripts/deploy-cloudflare.sh` (build + `wrangler pages deploy dist --project-name paezville --branch main`).

## Commands

```bash
npm run dev          # :5173
npm run build
npm run validate     # Playwright green-gate (MUST pass before commit)
npm run deploy       # build + Pages
```

## Layout (current)

```
src/main.js                 Phaser config 240×160
src/scenes/BootScene.js     relative asset loads + loading bar
src/scenes/WorldScene.js    maps, NPCs, staff, exits, boss trigger, ending
src/scenes/BattleScene.js   FF register; returns with bossDefeated
src/components/Dialogue.js  typewriter + branches + beeps
src/makeTileset.js          procedural 4-tile sheet
js/save.js                  CANONICAL save (do not re-inline)
public/maps/{isla,cerveceria,cancha}.json
public/assets/sprites/      RD sheets (copied to dist)
assets/sprites/             source RD outputs
docs/PLAN.md                phases + long-horizon
docs/STORY.md               happy-path stub
docs/REFERENCES.md          verified Córdoba facts
docs/STATUS.md              THIS file
```
