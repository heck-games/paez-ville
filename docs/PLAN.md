# Páez Ville — Implementation Plan (v0.1 POC → working game)

> **Name:** Páez Ville (always `à`). Real barrio *Villa Páez* (Córdoba) spelled differently on purpose.
> **Goal of this plan:** a **working, playable v0.1** — boot, walk a top-down world, talk to NPCs with
> authored multi-branch dialogue, swing the staff, win one turn-based fight, save progress — deployed to
> **paezville.heck.games**. Story is a happy-path stub, rewritten freely after the tag.

## Architecture (decided)

| Layer | Choice | Why |
|---|---|---|
| Engine | **Phaser 4** + Tiled JSON + rexVirtualJoystick | Code-first JS (agent edits source directly, no MCP bridge needed); best mobile-Safari perf; deepest touch-plugin field; highest LLM accuracy. Decided 2026-08-03 in the brief |
| Base resolution | **240×160 (GBA)** integer-scaled | Legible dialogue box + battle menu, tiny art footprint |
| Frontend hosting | **Cloudflare Pages** (`paezville.heck.games`) | Same as every heck.game, $0 |
| Saves (v0.1) | **localStorage** first | KISS — skip the backend until cross-device matters |
| Saves (post-0.1) | **D1** (new, unused on account) | Quest flags, dialogue-seen, 5M reads/day free |
| **Multiplayer** | **Feasible — defer past v0.1** | See §Multiplayer feasibility below |
| R2 (new CF service) | **Sprite + tile CDN via R2 public bucket** | New service requested; assets served from `r2.dev` with long immutable TTL; keeps Pages deploys tiny. First heck.game to use R2 |
| Combat | Two registers: staff-on-the-go (Zelda) + turn-based (Pokémon/FF, solo protag, charge gauge + items) | Per brief §2-3 |
| Assets | **RetroDiffusion** (9 keys, $0.50 each = $4.50 ≈ 64 calls, rotated) | Image-only; sprites/tiles/environments. Audio via numpy chiptune synth (free, offline) |
| Language | Argentine Spanish | Matches Alberdi + the history premise |

## What we reuse (port, don't rebuild)

From `games/calles-de-alberdi/` (the reference implementation):

| Piece | Source | How |
|---|---|---|
| Dialogue system (crown jewel) | `js/dialogue.js` (325 lines) | Port the typewriter/portrait/voice-beep logic; rewrite draw+input hooks for Phaser (Alberdi drew on Kaplay canvas) |
| RD sprite pipeline | `scripts/gen_sprites_rd.py`, `assemble_rd_sheets.py`, `rd_gen.py` | Copy, swap the prompt dicts + `STYLE_TAIL` to top-down, keep the API mechanics (`X-RD-Token`, `/v1/inferences`) |
| Sprite QA gate | `scripts/audit_sheets.py` | Port verbatim — non-negotiable after any asset change |
| Audio | `scripts/gen_audio.py` | Port numpy synth, new palette (town/battle themes not cuarteto) |
| Deploy + cache | `scripts/deploy-cloudflare.sh` | Port the `no-store` doc + `?v=sha` subresources + build-stamp pattern |
| Multiplayer transport | `rooms-worker/src/index.js` (GameRoom DO) | **Defer past v0.1** but the proven host-authoritative relay is ready to lift when needed |

**Does NOT carry over:** Alberdi `blocks` level format (→ Tiled), belt-scroll camera, brawler combat.

## RD key strategy

9 keys × $0.50 = **$4.50** ≈ 64 calls. Ledger at `config/rd-keys.json` (balance=TRUTH, not credits).
Rotation helper picks the key with highest remaining balance; skips keys where `balance ≤ cost+0.01`
(RD refuses a call when balance == cost, float precision). `rd-cache/` content-hashes prompts so a
re-fire of the same spec is free. Budget allocation for v0.1 (~50 calls):
- Player 4-dir walk + staff swing + hurt (3 calls via `rd_animation__small_sprites`, batched)
- 4 NPCs w/ turnarounds (2 calls)
- 2 trash enemies (1 call batched)
- 1 boss battle sheet (1 call)
- Tilesets: ground/walls/props for 3 maps (3 calls `rd_fast__game_asset` + `rd_plus__environment`)
- Portraits for dialogue (2 calls `rd_plus__character_turnaround`)
- Reserve ~38 calls for regeneration after `audit_sheets.py` rejections + iteration

## Multiplayer feasibility (investigated)

**Feasible and well-trodden, but defer past v0.1.** Finding from Alberdi's `multiplayer.js` (563 lines)
+ `rooms-worker/src/index.js` (263 lines):

- Alberdi multiplayer is **host-authoritative**: host simulates everything, broadcasts snapshots; guest
  sends input, renders what it's told. The server (`GameRoom` Durable Object) is a **pure WebSocket relay**
  with **zero game logic** — exactly the pattern that makes porting cheap.
- It runs on the **free** Workers plan via `new_sqlite_classes` (SQLite-backed Durable Objects are the only
  free kind). No `setInterval`/`alarm()` (those prevent hibernation → billed wall-clock). Hibernation API
  (`acceptWebSocket`, not `server.accept`) lets empty rooms cost nothing.
- The hard CF rule: **a Durable Object cannot live inside a Pages project** — it needs a separate Worker
  that the Pages site calls via a URL from `/api/config`.

**For Páez Ville specifically:** a top-down RPG is *simpler* to network than a beat-em-up (less state per
frame — movement is grid-ish, dialogue is turn-taking). The realistic co-op is **"walk the barrio together
+ shared dialogue"**, not a fighting co-op. Cost to add post-0.1: lift `rooms-worker/`, rename the DO, wire
  a `/api/config`, add guest rendering. **~1 day** because the relay is engine-agnostic. **Not in v0.1.**

## Phases (each green-gated: build → Playwright validate → commit)

### Phase 1 — Scaffold + bootable world (no art yet)
Vite + Phaser 4 project, index.html, a Tiled map (Isla de los Patos corner) loaded as placeholder rects,
player walks 4-dir with keyboard + rexVirtualJoystick, camera follows, integer-scale to window.
**Gate:** Playwright loads `localhost:5173`, sees canvas, no console errors, player moves on keypress.

### Phase 2 — Dialogue (port the crown jewel)
Port `dialogue.js` typewriter/portrait/voice-beep logic to Phaser. One authored multi-branch conversation
with an NPC at Isla de los Patos. **Gate:** Playwright triggers dialogue, asserts typewriter text appears,
can advance, branch choice changes the line.

### Phase 3 — First RD assets + sprite pipeline
Port `gen_sprites_rd.py` + key-rotation ledger + `audit_sheets.py`. Fire the player sprite (4-dir walk +
staff swing). Wire into Phaser as spritesheet animation. **Gate:** sprite renders, animates on walk, audit
passes.

### Phase 4 — Staff combat (Zelda register)
Swing-on-the-go: press attack → staff arc in front of player → trash enemy (one hit) despawns. No
transition, no menu. **Gate:** Playwright: spawn trash enemy, press attack, enemy removed, no battle UI.

### Phase 5 — Turn-based combat (Pokémon/FF register)
World stops, transition wipe, portrait + menu (Attack / Item / Charge), charge gauge builds, one boss.
Solo protagonist. Minimal. **Gate:** Playwright: approach boss → transition → menu → attack reduces boss HP
→ boss defeated → return to world.

### Phase 6 — Maps + story happy-path (3 locations)
Tiled maps for the 3 v0.1 locations, stitched by exits:
1. **Isla de los Patos** — the park island (starting area, NPC + first staff encounter)
2. **Cervecería Córdoba** — the brewery (first turn-based fight, the boss)
3. **Cancha de Belgrano / barrio Alberdi edge** — the stadium + neighborhood (the "touch Alberdi" nod)

Happy-path story (stub, rewritten after tag): player wakes on Isla de los Patos, talks to a vecino who
tells them the brewery is causing trouble, walks over, staff-fights stray dogs on the way, has the turn
fight at the brewery, resolves it, ends at the stadium looking toward Alberdi.

### Phase 7 — R2 asset CDN + Cloudflare Pages deploy
R2 public bucket for sprites/tiles (long immutable TTL); Pages serves the HTML/JS. Domain
`paezville.heck.games` CNAME → Pages project. **Gate:** `validate:live` — curl the live URL, asset-version
sha present, Playwright on the deployed URL boots the game.

### Phase 8 — Save system (localStorage)
Persist: current map, player position, quest flags, dialogue-seen, defeated bosses. Load on boot.
**Gate:** Playwright: play to brewery, reload, assert still at brewery with flags intact.

### v0.1 tag
All 8 phases green → tag `v0.1`. Story then rewritten freely.
