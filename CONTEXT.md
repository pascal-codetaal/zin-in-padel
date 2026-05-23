# Zin in Padel — Domain Context

## Glossary

### User
Someone who interacts with the WhatsApp bot. Identified by `waId` (WhatsApp ID).
Has opt-in state, onboarding state, and an `activeFlow`.

### Player
A co-player (teammate or opponent) identified by their **mobile phone number**.
A Player may or may not also be a User. The phone string is the unique key and
the join with `User.phone`. The User ↔ Player link is **derived** by phone
match — not stored explicitly. Format is whatever the user provides; no
canonical form is enforced (POC scope).

Fields: `{ phone, name }`. Phone is unique across all Players.

### Favorite Player
A Player that a User has marked as a co-player they regularly play with.
Stored as `User.favoritePlayerPhones: string[]` (each must exist as a
`Player` record). Multiple Users may share the same favorite Player
(deduplicated globally in `players[]`).

### Active Flow
A User's currently-running conversational subroutine. `User.activeFlow` is
either `null` (no flow — only hardcoded commands respond) or a flow name
(currently only `"favorites"`). When non-null, inbound messages route to
the Mastra agent.

### Favorites Flow
The agent-driven conversation that collects a User's favorite Players.
Entered automatically after `JA` opt-in, and re-entered manually via the
`MAATJES` command. The agent decides when the User is "klaar" and clears
`activeFlow`.

### Message
An inbound or outbound WhatsApp message. Stored in a single `messages[]`
collection with `direction: 'in' | 'out'`. Used both for audit and for
reconstructing conversation history for the agent.

## Commands (hardcoded, bypass agent)

| Command | Effect |
|---------|--------|
| `JA`       | Opt-in, then enter favorites flow |
| `STOP`     | Opt-out, clear `activeFlow` |
| `HELP`     | Show command list |
| `MAATJES`  | Re-enter favorites flow |

## Storage (Supabase Postgres via Prisma)

App data + club catalog live in Supabase Postgres (`DATABASE_URL`). Schema is in
`prisma/schema.prisma`; relational tables for users, players, favorites,
preferred clubs, matches (with invited/accepted/confirmed-slot join tables),
messages, games, clubs, and club Playtomic aliases.

- `app/lib/prisma.server.ts` exports a singleton Prisma client (HMR-safe).
- `app/lib/db.server.ts` and `app/lib/clubs.server.ts` wrap Prisma — call
  sites still operate on the domain types from `~/types/domain`.
- DB is the source of truth. Schema changes via `npx prisma migrate dev`.

## Phone numbers

- **No format validation.** Phone is stored as the user typed it and is the
  unique key for `Player`. Two users entering the same number in different
  shapes (e.g. `0612345678` vs `+31612345678`) currently produce two distinct
  Players. Revisit when leaving POC scope — see ADR 0001.

## Notes

- Legacy SQLite at `data/app.db` can be copied once via `pnpm db:copy-sqlite`. See README.
- Agent conversation memory lives in Mastra Memory + Postgres (same Supabase
  as the app, via `DATABASE_URL`), keyed by `thread = user.id` under a single
  shared `resource = "padel-assistant"`. The shared resource lets Mastra
  Studio show every user's chat in one place, regardless of which environment
  produced it. See `app/lib/mastra/memory.server.ts` and
  `app/lib/whatsapp-bot.server.ts`. The legacy LibSQL file at
  `data/mastra-memory.db` is no longer read — kept around as a backup. One-time
  migration: `pnpm tsx scripts/migrate-mastra-memory-to-pg.ts`.
