# 0004 — Pure-function cascade core with injected `now`

## Status
Accepted (2026-05-24).

## Context
The cascade contains the most behaviourally-rich, time-sensitive, and
race-prone logic in the app:

- Phase decisions depend on `now`.
- Audience filtering involves 7 exclusion rules.
- FCFS slot accounting must be transactional.
- Edge cases (cancelled match, past startsAt, full mid-tick, level=null)
  silently determine whether real WhatsApps go out.

If this logic lives inside HTTP handlers and queries that touch Twilio,
Postgres, and the job queue, it becomes effectively untestable. We will
not learn about a phase-transition bug until a real Saturday afternoon
match fails.

## Decision

### Cascade core is a pure module
Create `app/lib/cascade/` containing **pure functions** that take all
inputs (including `now: Date`) as arguments and return plain data:

```ts
// app/lib/cascade/decide.ts
export function decideCascadePhase(
  match: MatchWithInvites,
  now: Date,
): CascadeDecision { ... }

// CascadeDecision is a discriminated union:
type CascadeDecision =
  | { kind: 'idle' }                                      // nothing to do
  | { kind: 'fire-phase'; phase: 2 | 3; nextAt: Date | null }
  | { kind: 'mark-full' }
  | { kind: 'mark-exhausted' };
```

```ts
// app/lib/cascade/audience.ts
export function buildPhaseAudience(
  match: Match,
  phase: 1 | 2 | 3,
  candidates: User[],
  alreadyInvitedPhones: Set<string>,
  conflictingMatchesByPhone: Map<string, Match[]>,
  now: Date,
): User[] { ... }
```

```ts
// app/lib/cascade/format.ts
export function formatInviteMessage(
  match: Match,
  phase: 1 | 2 | 3,
  invitee: { firstName: string; level?: number | null },
  organiser: { fullName: string },
  acceptUrl: string,
  declineUrl: string,
): string { ... }
```

### Adapters do all the I/O
A separate adapter layer (`app/lib/cascade/runner.server.ts`) is the only
place that touches Prisma, the queue, or Twilio. It:

1. Loads the data the pure functions need.
2. Calls the pure functions.
3. Persists their results.

The adapter is thin and integration-tested. The pure core is unit-tested
exhaustively.

### Time is always an argument
- **No `new Date()` or `Date.now()`** inside `app/lib/cascade/*` pure files.
- Every function that depends on time takes `now: Date` as the final
  argument.
- Adapters pass `new Date()` at the boundary.
- Tests pass fixed `Date` values for deterministic assertions.

### Determinism rules
The pure core may not:
- Read environment variables.
- Read the filesystem.
- Generate randomness (tokens are generated in the adapter and passed in
  if needed).
- Throw on transient conditions (Twilio failure, DB outage) — those are
  adapter concerns.

### Test layout
- `app/lib/cascade/decide.test.ts` — table-driven tests for every
  `(currentPhase, configFlags, isFull, nextCascadeAt, now)` combination.
- `app/lib/cascade/audience.test.ts` — every exclusion rule with explicit
  fixtures.
- `whatsapp-templates/invites/format.test.ts` — snapshot the three message templates
  for representative inputs.

### Manual tick endpoint
`POST /dev/cron-tick?which=cascade|send` (only mounted when
`NODE_ENV !== 'production'`) runs the adapter once and returns a JSON
trace of what happened. The dev simulator UI calls it. This is the inner
dev loop — no waiting on cron.

## Consequences

**Good**
- Cascade behaviour is fully unit-testable without Postgres/Twilio.
- Fixing a "phase 2 fired 30 seconds early" bug is a unit test, not a
  reproduction in staging.
- Reasoning about edge cases happens in TypeScript types
  (`CascadeDecision` discriminated union) rather than scattered branches.
- Easy to add new cascade phases or exclusion rules — pure functions
  compose.

**Bad / accepted trade-offs**
- Slightly more files than a single "service" object. Worth it.
- Adapter ↔ pure split is a discipline the team must maintain. Code review
  enforces.
- Reading "what happens at tick" requires reading two files instead of
  one. Mitigated by the trace logging in the adapter.

## Alternatives considered

- **One big service class.** Easier to read end-to-end, impossible to test
  without standing up the whole stack. Rejected.
- **Inject a `Clock` interface.** Equivalent to injecting `now`, but more
  ceremony (one more module, one more mock). Not worth it for a single
  concern.
- **Use a workflow engine (Temporal, Inngest).** Solves orchestration but
  adds a vendor and a deployable runtime. Overkill for two cron beats and
  three phases.
