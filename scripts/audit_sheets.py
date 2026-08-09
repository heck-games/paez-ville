#!/usr/bin/env python3
"""Sprite QA gate for Paez Ville — ported from calles-de-alberdi's
audit_sheets.py (EMPTY/STATIC/uniq/COM-spread checks), adapted for this
game's top-down RD specs:

  - rd_animation__small_sprites (player, trash_perro): 5x4 turnaround grid,
    row 1 (frames 0-4) = side view facing LEFT walk cycle.
  - rd_animation__battle_sprites (boss_cervezero): 14x4 grid, 4 direction
    rows x columns idle 0-3 / walk 4-7 / jump 8-10 / attack 11-13.
  - rd_plus__character_turnaround (npc_vecino, npc_muchacha): a single
    portrait/turnaround image, not an animation grid — checked for
    non-blank content only, no frame-range analysis applies.

Usage:
    python3 scripts/audit_sheets.py <sheet.png> [<sheet2.png> ...]
    python3 scripts/audit_sheets.py                # audits all assets/sprites/*.png
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SPRITES_DIR = ROOT / "assets" / "sprites"

# Deliberate motion can move COM more than a hard art-defect threshold would
# suggest; 25px (same as Alberdi) catches genuine teleports/slivers without
# flagging intentional walk-cycle sway.
COM_LIMIT = 25

# Grid + frame-range table keyed by spec name (matched against the sheet's
# filename stem, e.g. "player.png" or "player_r2.png" -> spec "player").
GRID_BY_SPEC = {
    "player":         (5, 4, {"row1_left_walk": (0, 4)}),
    "trash_perro":    (5, 4, {"row1_left_walk": (0, 4)}),
    "boss_cervezero": (14, 4, {"idle": (0, 3), "walk": (4, 7), "jump": (8, 10), "attack": (11, 13)}),
}
# Single-image portrait/turnaround specs — no animation grid to slice.
PORTRAIT_SPECS = {"npc_vecino", "npc_muchacha"}


def frame_stats(img, cols, rows, idx):
    w, h = img.size
    fw, fh = w // cols, h // rows
    c, r = idx % cols, idx // cols
    cell = img.crop((c * fw, r * fh, (c + 1) * fw, (r + 1) * fh))
    px = cell.load()
    total = 0
    wx = 0
    for y in range(fh):
        for x in range(fw):
            if px[x, y][3] > 10:
                total += 1
                wx += x
    if total < 20:
        return None
    return {"com": wx / total, "px": total, "sig": hash(cell.tobytes())}


def spec_for(path: Path) -> str | None:
    stem = path.stem
    for spec in list(GRID_BY_SPEC) + list(PORTRAIT_SPECS):
        if stem == spec or stem.startswith(spec + "_"):
            return spec
    return None


def audit_portrait(path: Path) -> str:
    img = Image.open(path).convert("RGBA")
    px = img.load()
    w, h = img.size
    total = sum(1 for y in range(h) for x in range(w) if px[x, y][3] > 10)
    if total < 200:
        return f"EMPTY (only {total}px non-transparent of {w * h})"
    return "OK"


def audit_grid(path: Path, spec: str) -> str:
    cols, rows, anims = GRID_BY_SPEC[spec]
    img = Image.open(path).convert("RGBA")
    w, h = img.size
    flags = []
    if w % cols or h % rows:
        flags.append(f"DIMS {w}x{h} not /{cols}x{rows}")
    for anim, (f0, f1) in anims.items():
        stats = [frame_stats(img, cols, rows, i) for i in range(f0, f1 + 1)]
        n = f1 - f0 + 1
        empty = sum(1 for s in stats if s is None)
        good = [s for s in stats if s]
        uniq = len(set(s["sig"] for s in good))
        spread = (max(s["com"] for s in good) - min(s["com"] for s in good)) if good else 0
        probs = []
        if empty:
            probs.append(f"{empty}EMPTY")
        if n > 1 and uniq == 1:
            probs.append("STATIC")
        elif n > 2 and uniq < n / 2:
            probs.append(f"uniq{uniq}/{n}")
        if spread > COM_LIMIT:
            probs.append(f"COM{spread:.0f}px")
        if probs:
            flags.append(f"{anim}[{','.join(probs)}]")
    return " ".join(flags) if flags else "OK"


def audit_one(path: Path) -> str:
    if not path.exists():
        return "SKIP (file not found)"
    spec = spec_for(path)
    if spec is None:
        return f"SKIP (unrecognized spec for filename {path.name})"
    if spec in PORTRAIT_SPECS:
        return audit_portrait(path)
    return audit_grid(path, spec)


def main() -> int:
    args = sys.argv[1:]
    paths = [Path(a) for a in args] if args else sorted(SPRITES_DIR.glob("*.png"))

    failures = 0
    for path in paths:
        status = audit_one(path)
        print(f"{path.name:28} {status}")
        if status != "OK" and not status.startswith("SKIP"):
            failures += 1
    print(f"\n{'FAIL' if failures else 'PASS'}: {failures} sheet(s) with defects "
          f"(out of {len(paths)} checked)")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
