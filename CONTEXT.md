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

## Storage shape (`data/db.json`)

```jsonc
{
  "users": [ /* User[] — gains favoritePlayerPhones + activeFlow */ ],
  "players": [ /* Player[] — new */ ],
  "games": [ /* Game[] — unchanged */ ],
  "messages": [ /* Message[] — gains direction discriminator */ ]
}
```

## Phone numbers

- **No format validation.** Phone is stored as the user typed it and is the
  unique key for `Player`. Two users entering the same number in different
  shapes (e.g. `0612345678` vs `+31612345678`) currently produce two distinct
  Players. Revisit when leaving POC scope — see ADR 0001.

## Notes

- `data/db.json` is POC-only (not Vercel-safe). See README.
- Agent conversation memory lives in Mastra Memory + LibSQL
  (`data/mastra-memory.db`, gitignored), keyed by `thread = user.id`.
  See `app/lib/mastra/memory.server.ts`.
