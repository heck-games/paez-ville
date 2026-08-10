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

---

## Post-mortem — what broke on 2026-08-09/10 (READ THIS FIRST)

### What looked broken
`https://paezville.heck.games` failed with `ERR_NAME_NOT_RESOLVED` / empty curl
on some machines while `https://paezville.pages.dev` was fine and validated green.

### What was actually going on
1. **The game itself was green.** `npm run validate` against `pages.dev` passed all
   8 phase gates (canvas, move, dialogue, staff, turn battle, 3 maps, save).
2. **Custom domain WAS correctly attached** on the Pages project
   (`status: active`, CNAME `paezville.heck.games → paezville.pages.dev` proxied).
3. **Local DNS was poisoned.** Looking the name up *before* the DNS record existed
   cached NXDOMAIN for the zone SOA MINIMUM (**1800s**). Layers that disagreed:
   - authoritative / 1.1.1.1 / 8.8.8.8 → `172.64.80.1` ✅
   - Rogers `64.71.255.204` → ✅
   - Rogers `64.71.255.198` → NXDOMAIN ❌
   - Tailscale MagicDNS `100.100.100.100` (forwards to system default) → NXDOMAIN ❌
4. **`dig` lied about local reachability** (bypasses OS cache). Apps use
   `getaddrinfo`. Skill: `dns-propagation-debug`.
5. **Earlier false diagnosis:** empty `curl` body was a **local resolver failure**,
   not an empty Pages deploy. Always pin:  
   `curl --resolve paezville.heck.games:443:$(dig +short heck.games @1.1.1.1 | head -1) …`

### Code bugs found while the domain distraction was happening
These are real playability gaps the “v0.1 green” validation **did not catch**
because the harness used `__PAEZ` hooks instead of walking the happy path:

| Gap | Symptom | Fix |
|---|---|---|
| Boss never wired from Tiled | `type: boss` POI ignored; only hook could start battle | WorldScene spawns boss marker, proximity → taunt → Battle |
| Battle returned without `bossDefeated` | Win didn’t stick; boss re-fought forever | BattleScene passes `bossDefeated: true` + return coords |
| Save key split | `js/save.js` used `v1`, WorldScene inlined `v0.1` | Single canonical `js/save.js` key `paez_ville_save_v1` |
| Exits at wall / wrong spawn | Restart dropped player on reverse exit → instant bounce | `MAP_SPAWNS` + exit debounce + centered exit hitbox |
| Tile collision props missing on 2 maps | Walls not solid on cerveceria/cancha | tileset `collides` props on all 3 maps + gid fallback |
| Ending trigger never fired | `finish_v01` POI unused | `checkEnding()` after boss win |
| Deploy cache foot-gun | `_headers` had `immutable` on `/assets/*` (SPA poison) | `no-store` doc + `max-age=300 must-revalidate` assets + `?v=sha` stamp |
| Absolute asset paths | `/assets/...` breaks under subpath | BootScene relative paths (`assets/...`, `maps/...`) |

### Validation blind spots (fix the harness, not just the game)
- Hook-driven tests ≠ player-driven path. Add a **happy-path walk** test:
  isla → talk Tito → staff dog → exit → boss proximity → win → cancha ending.
- Always validate **both** `pages.dev` and custom domain (pinned IP) after deploy.
- Never judge deploy by one curl; multi-POP lag is 30–90s and nodes disagree.

---

## Landmines for the next agent (do not re-discover)

1. **Name spelling:** Páez (`à`). Never "Paes". Game title is *Páez Ville*.
2. **Real references mandatory** — `docs/REFERENCES.md` is the bible. Flavor free;
   dates/places/brands must match column-1 facts.
3. **Two combat registers stay separate.** Staff = no transition. Turn = world stops.
4. **NEVER overwrite generated assets.** `unique_path` / `_rN` suffix. RD is paid.
5. **RD balance is TRUTH** (not credits). Budget = `balance - 0.01`.
6. **Pages cannot host a Durable Object.** Multiplayer = separate Worker (post-0.1).
7. **Custom domain attach is 2 steps** (Pages domain API + proxied CNAME). DNS token
   ≠ wrangler OAuth. Skill: `cloudflare-free-deploy` §9.
8. **Create DNS first, probe second.** NXDOMAIN poison lasts 30 min. Skill:
   `dns-propagation-debug`.
9. **Never `immutable` on SPA assets.** Content-hash ≠ edge has the file yet.
10. **`functions/` empty or half-wired will 404/intercept** — keep empty until used.
11. **Porkbun is registrar only** for `heck.games`; DNS is on Cloudflare NS
    (`elisa`/`ian`). Don’t edit Porkbun records expecting CF to see them.
12. **Zone ID** `3d5c0405709f17ae19895d1eeb33dea1`, Account
    `c4dba63a117f3500cebc9b091759bb16`. DNS-capable keychain service:
    `cloudflare-darkscale-ops`.
13. **Dialogue component** lives at `src/components/Dialogue.js` (Phaser port).
    Legacy `js/dialogue.js` is the Alberdi-shaped original — don’t double-wire.
14. **Sprite frame sizes:** player/dog `32×32` (sheet 160×128), boss `64×64`
    (sheet 896×256), npc_vecino is a **256×256 turnaround** (crop, not sheet).

---

## Long-horizon plan (post-v0.1 → shippable barrio)

> Goal: a short but *complete* walking story people finish in ~15 min on phone,
> with real Córdoba history, then optional co-op.

### Horizon A — Playable spine polish (1–2 days) ← **you are here**
- [x] Domain live + deploy script hardened
- [x] Boss proximity + ending trigger + single save key
- [ ] Happy-path Playwright walk (no hooks for the critical path)
- [ ] Auto-save on map exit + on boss win + on ending (already partial)
- [ ] Title / continue screen if `hasSave()`
- [ ] Mobile: confirm joystick + A button on real phone Safari
- [ ] Visible controls hint on first boot (flechas / E / espacio / K)
- [ ] Re-tag `v0.1.1` after happy-path green on custom domain

### Horizon B — Art & audio pass (2–4 days, RD budget)
- Real tilesets for isla / cerveceria / cancha (`rd_fast__game_asset` + environment)
- Player staff-swing frames + hurt flash
- don Tito idle (use cropped turnaround properly or re-fire top-down NPC)
- Portraits for dialogue (Tito, Cervecero, Vecina)
- Chiptune: town theme + battle sting via `scripts/gen_audio.py` (numpy, free)
- **Gate:** `audit_sheets.py` green; no clobber; ledger balances updated

### Horizon C — Story rewrite (after art baseline)
- Replace STORY.md stub with full authored Argentine-Spanish script
- Multi-branch Tito (history vs trouble) already scaffolded — deepen, don’t replace
- Cervecero pre/post lines cite 1912/1917, Munich/Bock, 105-day 1998 toma, 2010 chimney
- Cancha ending nods 2002 fusion Argentino Flores + 9 de Julio
- Optional: one more NPC (muchacha) with a single color line — already on map
- **Still no LLM dialogue in shipping build** (authored only)

### Horizon D — Feel & juice
- Camera nudge on staff hit; hit-stop 2 frames
- Battle transition wipe (iris or bar-scroll)
- HP numbers / floating damage in battle
- Save icon blip; “partida guardada”
- Pause menu: continuar / guardar / borrar partida

### Horizon E — Multiplayer co-op explore (post-content)
- Lift Alberdi `rooms-worker/` DO relay (engine-agnostic, ~1 day)
- Host-authoritative positions + shared dialogue lock
- **Separate Worker** bound from Pages via `/api/config` — never inside Pages
- Free plan: SQLite DO + hibernation; no `setInterval`

### Horizon F — Backend saves (only if cross-device demanded)
- D1 quest flags + dialogue-seen (5M reads/day free)
- Keep localStorage as offline cache; D1 is source of truth when authed
- Don’t build auth until someone asks

### Horizon G — Distribution
- OG image 1200×630 from Playwright screenshot of Isla
- `heck.games` hub card
- Optional itch.io embed (same `dist/`)

### Explicit non-goals (still)
- Party members, jobs, equipment tiers, ATB, summons
- More than ~1 turn fight until story rewrite needs it
- Kaplay/editor migration
- Shared save with Alberdi

---

## Commands cheat-sheet (next agent)

```bash
npm run dev              # :5173
npm run build && npm run validate
PV_VALIDATE_URL=https://paezville.pages.dev/ npm run validate
npm run deploy           # build + stamp + wrangler + live validate
python3 scripts/rd_keys.py balances
python3 scripts/gen_sprites_rd.py --spec player --check-cost
```

Custom domain DNS panic button:
```bash
IP=$(dig +short heck.games @1.1.1.1 | head -1)
curl -sS --resolve paezville.heck.games:443:$IP https://paezville.heck.games/ | head
# Playwright: chromium.launch({ args: [`--host-resolver-rules=MAP paezville.heck.games ${IP}`] })
```

