# 0001 — Player identity and phone number format

## Status
Accepted

## Context
The bot collects a User's "favorite players" — co-players identified by mobile
phone number. A player may or may not be a User of the bot. We need to decide:

1. How to identify a Player (surrogate id vs. natural key).
2. Whether to store the User↔Player link explicitly.
3. What phone-number format to accept and store.

## Decision

### Phone is the Player primary key
A `Player` is `{ phone, name }`. No surrogate `id`. Phone is globally unique
in `players[]`. A `User.favoritePlayerPhones: string[]` references players
by phone.

### User ↔ Player link is derived, not stored
A Player is "also a User" when `Player.phone === User.phone`. No explicit
`linkedUserId` field. Derivation is cheap at this data scale and keeps the
schema from going out of sync.

### Phone numbers are E.164, strictly validated
- Canonical storage format: E.164 (e.g. `+31612345678`).
- Inputs are validated, not normalized — the agent must prompt the user
  to provide E.164 if they type `06...` or `06-12-34-56-78`.
- The `addFavorite` tool rejects non-E.164 input and surfaces the error
  back to the agent for re-prompting.

## Consequences

**Good**
- Single canonical phone format means the `User.phone ↔ Player.phone` join
  always works.
- No id/link synchronization bugs.
- Validation surfaces input quirks (foreign numbers, copy-paste artifacts)
  early instead of corrupting the join key.

**Bad / accepted trade-offs**
- Slightly worse first-touch UX: NL users will need to be told to use
  `+31...` rather than `06...`. Mitigated by clear agent prompting.
- If we ever need stable Player ids for external references, we'll have
  to migrate. Phone is good-enough as a stable id for now.
- Renaming a Player still works (name is mutable); changing a Player's
  phone is effectively a delete + create (acceptable — phone *is* identity).

## Alternatives considered

- **Surrogate `Player.id` + explicit `linkedUserId`**: more conventional
  but adds two fields and two failure modes (id sync, link sync) for no
  benefit at JSON-file scale.
- **Auto-normalize `06...` → `+316...`**: friendlier UX but bakes in NL
  country assumptions and creates ambiguity for foreign numbers. Revisit
  if NL-only assumption is confirmed product-wide.
