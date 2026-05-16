# Zin in Padel — Domain Context

## Glossary

### User
Someone who interacts with the WhatsApp bot. Identified by `waId` (WhatsApp ID).
Has opt-in state, onboarding state, and an `activeFlow`. A User always has a `phone`
in E.164 format.

### Player
A co-player (teammate or opponent) identified by **mobile phone number in E.164**.
A Player may or may not also be a User. The phone number is the unique key
and the join with `User.phone`. The User ↔ Player link is **derived** by phone
match — not stored explicitly.

Fields: `{ phone, name }`. Phone is unique across all Players.

### Favorite Player
A Player that a User has marked as a co-player they regularly play with.
Stored as `User.favoritePlayerPhones: string[]` (E.164 strings, each must
exist as a `Player` record). Multiple Users may share the same favorite
Player (deduplicated globally in `players[]`).

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

- **Canonical storage:** E.164 (`+316...`)
- **Validation:** strict — agent must prompt user for E.164 format and the
  `addFavorite` tool refuses non-E.164 input.

## Notes

- `data/db.json` is POC-only (not Vercel-safe). See README.
- Conversation memory is reconstructed from `messages[]` per turn (no
  Mastra Memory store yet). Swap to LibSQL/Postgres when leaving JSON.
