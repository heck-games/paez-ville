#!/usr/bin/env python3
"""RetroDiffusion sprite generation for Paez Ville.

Top-down 2D RPG (NOT the beat-em-up side-scroller Alberdi is) — set in a
working-class Cordoba, Argentina neighborhood ("barrio"). Ported from
calles-de-alberdi/scripts/gen_sprites_rd.py + rd_gen.py, adapted for:

  - Multi-key rotation via scripts/rd_keys.py (9 keys, config/rd-keys.json)
    instead of a single ~/.retrodiffusion-token file.
  - Top-down sprite style (4-direction walk cycles) instead of side-view
    beat-em-up rows.
  - Content-hash cache under rd-cache/ with a no-clobber write helper (per
    the global "never overwrite a generated asset" rule) — generated PNGs
    are paid and non-reproducible, so a genuine name collision suffixes
    _r2/_r3/... rather than clobbering.

API mechanics are UNCHANGED from Alberdi: POST /v1/inferences with an
X-RD-Token header, GET /v1/inferences/credits for balance, check_cost:true
for a free dry-run cost estimate.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import rd_keys  # noqa: E402

API = "https://api.retrodiffusion.ai/v1/inferences"
ROOT = Path(__file__).resolve().parents[1]
CACHE_DIR = ROOT / "rd-cache"
SPRITES_DIR = ROOT / "public" / "assets" / "sprites"

# Top-down RPG style tail — replaces Alberdi's beat-em-up
# ("Gritty 90s beat-em-up street style, side view facing right...").
STYLE_TAIL = (
    "Top-down 2D RPG sprite, Game Boy Color / GBA era pixel art, clean "
    "readable outline, warm working-class Cordoba Argentina neighborhood "
    "(barrio) palette, transparent background, no text, no watermark."
)

GLOBAL_PREAMBLE = ""  # reserved for future shared prefix, mirrors rd_gen.py shape

SPECS = {
    "player": {
        "prompt_style": "rd_animation__small_sprites",
        "width": 32, "height": 32, "num_images": 1,
        "extras": {"return_spritesheet": True, "frames_duration": 4},
        "prompt": (
            "4-direction walk cycle turnaround of a barrio kid, working-class "
            "Cordoba Argentina streetwear (soccer jersey, shorts, zapatillas), "
            "short dark hair, determined expression. " + STYLE_TAIL
        ),
    },
    "npc_vecino": {
        "prompt_style": "rd_plus__character_turnaround",
        "width": 256, "height": 256, "num_images": 1,
        "prompt": (
            "character turnaround sheet of an older Argentine neighbor "
            "(vecino), grey mustache, short-sleeve button shirt, house "
            "slippers, holding a mate gourd, friendly weathered face. "
            + STYLE_TAIL
        ),
    },
    "npc_muchacha": {
        "prompt_style": "rd_plus__character_turnaround",
        "width": 256, "height": 256, "num_images": 1,
        "prompt": (
            "character turnaround sheet of a young Argentine woman from the "
            "barrio (muchacha), dark ponytail, casual streetwear (cropped "
            "tee, jeans), warm confident expression, standing pose. "
            + STYLE_TAIL
        ),
    },
    "trash_perro": {
        "prompt_style": "rd_animation__small_sprites",
        "width": 32, "height": 32, "num_images": 1,
        "extras": {"return_spritesheet": True, "frames_duration": 4},
        # RD refuses quadrupeds and draws upright teddy-bipeds regardless of
        # prompt (per retro-game-content-pipeline skill) — lean into a small
        # scrappy creature that reads fine standing upright, and rely on the
        # final lying/horizontal frame as a fallback scamper pose if needed.
        "prompt": (
            "small scrappy street dog (perro callejero) character, patchy "
            "brown and white fur, perky ears, stubby tail, mischievous "
            "cartoon posture, works as a small upright creature sprite. "
            + STYLE_TAIL
        ),
    },
    "boss_cervezero": {
        "prompt_style": "rd_animation__battle_sprites",
        "width": 64, "height": 64, "num_images": 1,
        "extras": {"return_spritesheet": True},
        "prompt": (
            "boss character: burly brewery foreman (cervecero), stained work "
            "apron over flannel shirt, thick forearms, bottle-cap belt "
            "buckle, angry scowl, imposing stance. " + STYLE_TAIL
        ),
    },
}


def _short(token: str) -> str:
    return token[:10] + "..." if len(token) > 10 else token


def unique_path(p: Path) -> Path:
    """Suffix instead of overwrite — generated assets are paid and
    non-reproducible (global CLAUDE.md never-overwrite-generated-assets rule).
    """
    if not p.exists():
        return p
    n = 2
    while (q := p.with_name(f"{p.stem}_r{n}{p.suffix}")).exists():
        n += 1
    print(f"[keep] {p.name} exists -> writing {q.name}")
    return q


def content_hash(spec_name: str, payload: dict) -> str:
    """Hash (prompt_style + prompt + params) for the cache key. Excludes
    check_cost / seed-less variability so identical fires reuse cache."""
    key_material = json.dumps(
        {
            "spec": spec_name,
            "prompt_style": payload["prompt_style"],
            "prompt": payload["prompt"],
            "width": payload["width"],
            "height": payload["height"],
            "num_images": payload["num_images"],
            "extras": {k: v for k, v in payload.items()
                       if k not in {"prompt", "prompt_style", "width",
                                     "height", "num_images", "check_cost"}},
        },
        sort_keys=True,
    )
    return hashlib.sha256(key_material.encode()).hexdigest()[:16]


def cache_path(spec_name: str, h: str) -> Path:
    return CACHE_DIR / f"{spec_name}_{h}.png"


def req(body: dict, token: str) -> dict:
    r = urllib.request.Request(
        API, data=json.dumps(body).encode(), method="POST",
        headers={"X-RD-Token": token, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(r, timeout=300) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as e:
        print("HTTP", e.code, e.read().decode()[:500])
        raise


def build_payload(spec: dict) -> dict:
    payload = {
        "prompt": GLOBAL_PREAMBLE + spec["prompt"],
        "prompt_style": spec["prompt_style"],
        "width": spec["width"],
        "height": spec["height"],
        "num_images": spec["num_images"],
    }
    if spec.get("extras"):
        payload.update(spec["extras"])
    return payload


def save_outputs(spec_name: str, out: dict, h: str) -> list[Path]:
    """Write to the content-hash cache first (no-clobber), then mirror the
    primary image into assets/sprites/ under a descriptive, no-clobber name.
    """
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    SPRITES_DIR.mkdir(parents=True, exist_ok=True)

    imgs = out.get("base64_images") or []
    written = []
    for i, b64 in enumerate(imgs):
        data = base64.b64decode(b64)
        ext = "gif" if data[:3] == b"GIF" else "png"
        suffix = "" if len(imgs) == 1 else f"_{i + 1}"

        c_path = unique_path(cache_path(spec_name, h).with_suffix(f"{suffix}.{ext}"))
        c_path.write_bytes(data)

        s_path = unique_path(SPRITES_DIR / f"{spec_name}{suffix}.{ext}")
        s_path.write_bytes(data)

        written.append(s_path)
        print(f"  saved {s_path.relative_to(ROOT)} ({len(data) // 1024}KB) "
              f"cache={c_path.name} "
              f"cost=${out.get('balance_cost')} left=${out.get('remaining_balance')}")
    return written


def run_spec(spec_name: str, check_cost: bool) -> dict:
    spec = SPECS[spec_name]
    payload = build_payload(spec)
    h = content_hash(spec_name, payload)

    if not check_cost:
        cached = cache_path(spec_name, h)
        # look for any cached variant (suffix _1, _2, ...) matching this hash
        existing = list(CACHE_DIR.glob(f"{spec_name}_{h}*"))
        if existing:
            print(f"[gen_sprites_rd] cache hit for '{spec_name}' (hash={h}), "
                  f"skipping fire: {[p.name for p in existing]}")
            SPRITES_DIR.mkdir(parents=True, exist_ok=True)
            mirrored = []
            for src in existing:
                dst = unique_path(SPRITES_DIR / src.name.replace(f"_{h}", ""))
                dst.write_bytes(src.read_bytes())
                mirrored.append(dst)
            return {"cached": True, "hash": h, "files": mirrored}

    cost_payload = dict(payload)
    cost_payload["check_cost"] = True
    est_token = rd_keys.next_token(0.0)  # any active key can do a free check_cost
    est = req(cost_payload, est_token)
    est_cost = est.get("balance_cost") or est.get("cost") or 0.0
    print(f"[gen_sprites_rd] '{spec_name}' estimated cost=${est_cost} "
          f"(style={spec['prompt_style']}, {spec['width']}x{spec['height']})")

    if check_cost:
        return {"check_cost": True, "estimated_cost": est_cost, "hash": h,
                "spec": spec_name}

    token = rd_keys.next_token(est_cost)
    resp = req(payload, token)
    log_resp = {k: v for k, v in resp.items() if k != "base64_images"}
    if "base64_images" in resp:
        log_resp["base64_images_count"] = len(resp["base64_images"])
    print(json.dumps(log_resp, indent=2))

    images = resp.get("base64_images") or []
    if not images:
        raise RuntimeError(f"RD returned no base64_images for '{spec_name}'; aborting")

    spent = resp.get("balance_cost") or est_cost
    rd_keys.record_spend(token, spent)

    written = save_outputs(spec_name, resp, h)
    return {"fired": True, "hash": h, "files": written, "spent": spent}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--spec", choices=sorted(SPECS.keys()),
                     help="which spec to generate; omit to run all")
    ap.add_argument("--check-cost", action="store_true",
                     help="dry run: estimate cost + select key, no spend, no fire")
    args = ap.parse_args()

    names = [args.spec] if args.spec else sorted(SPECS.keys())
    for name in names:
        result = run_spec(name, args.check_cost)
        print(f"[gen_sprites_rd] '{name}' -> {result}")


if __name__ == "__main__":
    main()
