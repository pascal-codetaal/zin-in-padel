# 0002 — Collapse `MatchAcceptedPlayer` into `MatchInvitedPlayer`

## Status
Accepted (2026-05-24). Implementation pending — see ADR-0003 (cascade
scheduler) and the invites implementation plan for sequencing.

## Context
Match invites currently live in two parallel join tables:

- `MatchInvitedPlayer` — set of Players the organiser asked.
- `MatchAcceptedPlayer` — subset who claimed a slot (FCFS).

Plus a denormalised `Match.acceptedPlayerRefs: string[]` mirror.

With the full invite system (cascade phases, per-invite tokens, decline
state, send timestamps, retry/dead-letter analytics) we need to track far
more per-invite lifecycle data than two flat join tables comfortably hold.
Splitting an invite's identity across two tables forces every query and
mutation to coordinate both, and creates ambiguous states (a row in
`accepted` that's missing from `invited`, or vice-versa).

## Decision

### Single join table: `MatchInvitedPlayer`
`MatchInvitedPlayer` becomes the **single source of truth** for the entire
invite lifecycle. `MatchAcceptedPlayer` is dropped.
`Match.acceptedPlayerRefs` is dropped — the accepted set is derived by
filtering `MatchInvitedPlayer.status = 'accepted'`.

### New columns on `MatchInvitedPlayer`
| Column           | Type                                                       | Purpose |
|------------------|------------------------------------------------------------|---------|
| `token`          | `String @unique` (base62, 22 chars)                        | Per-invite deep-link token. |
| `status`         | `enum InviteStatus { pending, accepted, declined, expired }` | Lifecycle state. |
| `cascadePhase`   | `Int` (1 \| 2 \| 3)                                        | Which phase produced this invite. |
| `sentAt`         | `DateTime?`                                                | Set after Twilio confirms delivery. Null while queued. |
| `respondedAt`    | `DateTime?`                                                | Set on accept or decline. |
| `sendAttempts`   | `Int @default(0)`                                          | Twilio retry counter (dead-letters at 3). |
| `sendError`      | `String?`                                                  | Last Twilio error message if dead-lettered. |

Existing columns (`matchId`, `playerPhone`, etc.) stay.

### New columns on `Match`
| Column                 | Type                                                  | Purpose |
|------------------------|-------------------------------------------------------|---------|
| `currentCascadePhase`  | `Int @default(0)`                                     | 0 = not started, 1/2/3 = last fired phase. |
| `nextCascadeAt`        | `DateTime?`                                           | When the next phase should fire. Null = cascade exhausted or paused. |

### Removed
- Table `MatchAcceptedPlayer` (entire table).
- Column `Match.acceptedPlayerRefs` (and its serialised representation in
  the domain type).

### Derived helper
`acceptedPlayerRefsOf(match)` reads from `match.invitedPlayers` filtered by
`status = 'accepted'`. Replaces all current reads of `acceptedPlayerRefs`.
`isMatchFull` and `openSlotsOf` switch to this helper.

## Migration

1. New Prisma migration:
   - `CREATE TYPE "InviteStatus" AS ENUM (...)`.
   - Add new columns to `MatchInvitedPlayer` (nullable initially), `Match`.
   - Backfill `MatchInvitedPlayer.status`:
     - If `(matchId, playerPhone)` exists in `MatchAcceptedPlayer` →
       `status='accepted'`, `respondedAt=COALESCE(MatchAcceptedPlayer.acceptedAt, now())`.
     - Else → `status='pending'`.
   - Backfill `cascadePhase=1`, `sentAt=invitedAt` (best-effort — assume
     all existing invites were phase 1 sends).
   - Backfill `token` with freshly-generated base62 strings.
   - Set `MatchInvitedPlayer.status` NOT NULL after backfill.
   - `DROP TABLE "MatchAcceptedPlayer"`.
   - `ALTER TABLE "Match" DROP COLUMN "acceptedPlayerRefs"`.
2. Code migration:
   - Replace all reads of `acceptedPlayerRefs` with `acceptedPlayerRefsOf(match)`.
   - Replace writes that insert into `MatchAcceptedPlayer` with writes that
     flip `MatchInvitedPlayer.status` to `'accepted'`.
   - Update domain types in `app/types/domain.ts`.

## Consequences

**Good**
- One row per (match, invitee) — no split-state ambiguity.
- Full lifecycle is locally inspectable: phase, sent time, response time,
  retry attempts, all in one row.
- Per-invite token has an obvious home.
- FCFS check is a single `SELECT count(*) WHERE status='accepted' FOR UPDATE`
  inside the transaction.
- Eliminates the denormalised `acceptedPlayerRefs` array that had to be
  kept in sync.

**Bad / accepted trade-offs**
- Breaking schema change — one-off migration must run before deploy.
- Reads of "accepted set" are now derived. Negligible cost at our scale
  (matches have ≤ 30 invite rows in the worst phase-3 case).
- Existing code that touched `MatchAcceptedPlayer` must be rewritten in
  the same PR as the migration.

## Alternatives considered

- **Keep both tables, add token to `MatchInvitedPlayer`.** Rejected:
  doesn't solve the split-state problem and forces decline/expire to live
  somewhere awkward.
- **Add a `Response` table separate from both.** Three tables instead of
  one. More joins, more places to keep in sync. Rejected.
