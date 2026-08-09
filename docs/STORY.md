# Páez Ville — Story (v0.1 happy-path stub)

> **This is a stub.** It will be rewritten freely after the `v0.1` tag. Keep it simple,
> keep it happy, keep the beats few enough that the engine can prove all its systems
> (walk, talk, staff-fight, turn-fight, save) without content volume killing the build.

> **Real references are mandatory.** Every historical detail an NPC states must match
> [`docs/REFERENCES.md`](./REFERENCES.md) (the verified Córdoba / Villa Páez / Alberdi
> source bible). Flavor and personalities are fiction; dates, names, places are real.

## Tone

Warm. A barrio you walk through and *talk to*. History surfaces through conversation, not
exposition. No grimdark. Combat is friction and punctuation, never the point. Argentine
Spanish throughout, working-class Córdoba register. The **Río Suquía** is the spine —
Villa Páez borders it, the Isla sits in it, the brewery stood on its bank.

## The three locations (v0.1 scope)

1. **Isla de los Patos** — the park island. Green, calm, where you start. Has a bench, a
   vecino, some wandering stray dogs (staff-trash mobs). Exits lead to the brewery.
2. **Cervecería Córdoba** — the brewery. Industrial, clattering. The boss (el cervecero
   foreman) is here. The one real (turn-based) fight of v0.1 happens at the loading dock.
3. **Cancha de Belgrano / barrio Alberdi edge** — the stadium and the lip of the next
   barrio. The resolution screen: you look out over Alberdi (the "touch Alberdi" nod — a
   shared skyline, maybe a sign, nothing more). v0.1 ENDS here.

## Happy-path beats (the spine) — woven with real references

1. **Wake on the Isla de los Patos.** Player stands by a bench on the **artificial island in the
   Río Suquía, at the height of Barrio Alberdi**. The vecino (don Tito) waves you over. A sign or
   plaque notes the island was **inaugurated 21 de agosto de 1991** and that they once released
   hundreds of ducks here. (Real — see REFERENCES §2.)
2. **Talk to don Tito** (multi-branch dialogue). He's old enough to remember. Branch A (ask about
   the barrio): he tells you **Villa Páez has been here since the 1920s**, named for the **Páez
   family**, right on the **Suquía**, and mentions the **18th-century tunnel** they found under
   the barrio. Branch B (what's wrong): the old **Cervecería Córdoba** up the bank has been
   restless — rattling, the dogs won't leave it alone — and someone should go have a look.
   (All column-1 facts from REFERENCES §1, §3.) The branches rejoin: head to the brewery.
3. **Cross to the brewery path along the Suquía.** Two stray dogs block the way — they gather
   here because of the ducks (staff combat, Zelda register). Swing the staff, they scatter.
   No menu, no transition, no reward screen.
4. **Enter the Cervecería Córdoba** (corner of **Arturo Orgaz y La Tablada**, Barrio Alberdi).
   Crates labeled **MUNICH** and **BOCK** are stacked by the dock (real brands, REFERENCES §3).
   The foreman — *el cervecero* (a fictional spirit of the old factory) — is slamming crates and
   mourns the **chimney they demolished in 2010, after 83 years**. He takes offense. A pre-fight
   taunt references the **105-day toma of 1998**, the longest factory occupation in Argentine
   history — *he doesn't take kindly to being told to leave a place people fought to keep.*
   **World stops → transition wipe → turn-based fight** (FF register): portrait, menu
   (Attack / Item / Charge), charge gauge fills, you win in a few turns.
5. **Resolution.** The foreman, defeated, grumbles off — "the factory belongs to those who worked
   it" (echoing the toma's spirit). Walk out to the **Cancha del Deportivo Alberdi**. Look toward
   Alberdi. A closing line from don Tito (who caught up): the cancha's club was born in **2002 from
   the fusion of Argentino Flores and 9 de Julio** — *dos clubes, un barrio* — and that's the
   barrio looking out for itself. **v0.1 ends.** Save the game.

## What's explicitly OUT of v0.1

- Party members (solo protagonist only).
- More than one turn-based fight (the foreman).
- More than two staff-trash encounters (the dogs).
- Jobs, equipment tiers, elemental affinities, summons, ATB.
- Co-op / multiplayer (deferred — see PLAN.md).
- Any LLM-generated dialogue (the writing is authored; that's the premise).
- Real deep history (the v0.1 lines are local-color sketches, not cited history — that
  distinction gets made properly when the story is rewritten post-tag).

## Branches (just enough to prove the system)

- don Tito convo: 2 branches (ask-about-history vs head-straight-out) that rejoin.
- Foreman pre-fight: 1 taunt exchange, no branch (keeps it simple).
- Closing: 1 line, no branch.

## Casting (matches the sprites generated in Phase 3)

| Sprite | Role |
|---|---|
| `player` | The protagonist (a barrio kid from Villa Páez) |
| `npc_vecino` | don Tito, an old neighbor on the Isla who remembers the barrio's history |
| `npc_muchacha` | A young woman near the cancha (one line of color, optional talk) |
| `trash_perro` | Stray dogs on the brewery path (drawn by the ducks) |
| `boss_cervezero` | El cervecero — the spirit/foreman of the old Cervecería Córdoba (the one turn fight) |

## Map detail references (for the Tiled map author)

- **Isla de los Patos:** artificial island, Suquía riverbank, ducks, a bench, a "1991" plaque.
- **Brewery path:** follows the Suquía bank from the Isla toward Barrio Alberdi.
- **Cervecería Córdoba:** industrial dock, stacked crates labeled **MUNICH / BOCK / CÓRDOBA**,
  a (gone) chimney marked as a ruin or silhouette, the corner of **Arturo Orgaz y La Tablada**.
- **Cancha del Deportivo Alberdi:** small stadium (~1.000 cap), a pool, a view toward Alberdi,
  a nod to the **Argentino Flores + 9 de Julio** fusion.
- **Villa Páez touches:** a sealed **colonial tunnel** entrance as environmental detail; street
  signs reading **12 de Octubre**; the **Suquía** always visible to one side.
