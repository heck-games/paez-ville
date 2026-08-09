#!/usr/bin/env python3
"""RetroDiffusion multi-key rotation ledger for Paez Ville.

Unlike calles-de-alberdi (single token at ~/.retrodiffusion-token), Paez
Ville rotates across 9 keys tracked in config/rd-keys.json. `balance` is
TRUTH (refreshed from the live API after every spend); `credits_static` is
just the informational signup grant and is never decremented.

Security: token values are NEVER printed/logged beyond a short prefix
(e.g. "rdpk-C4GY..."). Callers must not print the full token themselves.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from pathlib import Path

LEDGER_PATH = Path(__file__).resolve().parents[1] / "config" / "rd-keys.json"
CREDITS_URL = "https://api.retrodiffusion.ai/v1/inferences/credits"

# Float-precision refusal: the API rejects a call when balance == cost
# exactly. Budget every key as balance - EPS, matching Alberdi's convention.
EPS = 0.01


def _short(token: str) -> str:
    """Short, safe-to-print prefix of a token. Never print the full value."""
    return token[:10] + "..." if len(token) > 10 else token


def load_ledger() -> dict:
    return json.loads(LEDGER_PATH.read_text())


def _save_ledger(ledger: dict) -> None:
    LEDGER_PATH.write_text(json.dumps(ledger, indent=2) + "\n")


def _recompute_totals(ledger: dict) -> None:
    keys = ledger["keys"]
    ledger.setdefault("totals", {})
    ledger["totals"]["balance_all"] = round(sum(k["balance"] for k in keys), 4)
    ledger["totals"]["spent_all"] = round(sum(k["spent"] for k in keys), 4)
    # calls_estimate: rough count of $0.07 calls the remaining balance could
    # still afford across all active keys.
    balance_all = ledger["totals"]["balance_all"]
    ledger["totals"]["calls_estimate"] = int(balance_all / 0.07) if balance_all > 0 else 0


def next_token(cost: float) -> str:
    """Return the token of the ACTIVE key with the highest remaining balance
    that can afford `cost` (respecting the float-precision refusal margin).

    Raises RuntimeError if no active key can afford it.
    """
    ledger = load_ledger()
    candidates = [
        k for k in ledger["keys"]
        if k.get("status") == "active" and k["balance"] > cost + EPS
    ]
    if not candidates:
        raise RuntimeError(
            f"no active RD key can afford cost=${cost:.4f} "
            f"(checked {len(ledger['keys'])} keys)"
        )
    best = max(candidates, key=lambda k: k["balance"])
    print(f"[rd_keys] selected {best['id']} ({_short(best['token'])}) "
          f"balance=${best['balance']:.4f} for cost=${cost:.4f}")
    return best["token"]


def _fetch_balance(token: str) -> float:
    req = urllib.request.Request(CREDITS_URL, headers={"X-RD-Token": token})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.load(resp)["balance"]
    except urllib.error.HTTPError as e:
        print(f"[rd_keys] HTTP {e.code} fetching balance: {e.read().decode()[:300]}")
        raise


def record_spend(token: str, amount: float) -> None:
    """Refresh the spending key's balance from the live API (truth, not a
    local subtraction), bump `spent`, recompute ledger totals, and persist.
    """
    ledger = load_ledger()
    match = None
    for k in ledger["keys"]:
        if k["token"] == token:
            match = k
            break
    if match is None:
        raise RuntimeError("record_spend: token not found in ledger (never log full token)")

    fresh_balance = _fetch_balance(token)
    match["spent"] = round(match.get("spent", 0.0) + amount, 4)
    match["balance"] = round(fresh_balance, 4)
    if match["balance"] <= EPS:
        match["status"] = "exhausted"

    _recompute_totals(ledger)
    _save_ledger(ledger)
    print(f"[rd_keys] {match['id']} ({_short(token)}) spend=${amount:.4f} "
          f"-> balance=${match['balance']:.4f} status={match['status']}")


def balances() -> None:
    """Print a table of all keys' id/balance/spent/status plus totals."""
    ledger = load_ledger()
    print(f"{'id':8} {'prefix':14} {'balance':>10} {'spent':>10} {'status':10}")
    for k in ledger["keys"]:
        print(f"{k['id']:8} {_short(k['token']):14} "
              f"${k['balance']:>8.4f} ${k['spent']:>8.4f} {k['status']:10}")
    totals = ledger.get("totals", {})
    print(f"\nTOTAL balance=${totals.get('balance_all', 0):.4f} "
          f"spent=${totals.get('spent_all', 0):.4f} "
          f"calls_estimate={totals.get('calls_estimate', 0)}")


if __name__ == "__main__":
    balances()
