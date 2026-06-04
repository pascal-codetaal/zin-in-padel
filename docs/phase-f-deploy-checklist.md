# Deploy checklist — Fly app + worker

Step-by-step ops checklist to deploy and turn on the invite queue in
production. Tick boxes as you go.

Read `docs/phase-f-cron-setup.md` for the "why" behind each step, and
ADR-0005 for the architecture.

> Replaces the old Supabase-cron checklist (ADR-0003). Production now runs a
> Fly `worker` process consuming BullMQ queues on Redis — no `pg_cron`,
> `pgmq`, or `CRON_SECRET` required.

---

## 0. Pre-flight

- [ ] Logged into Fly: `fly auth whoami` succeeds.
- [ ] A Redis instance exists; you have its `rediss://` URL
      (`REDIS_URL = ____________________`).
- [ ] Supabase Postgres URLs ready (`DATABASE_URL` pooler, `DIRECT_URL`
      direct).
- [ ] Twilio + OpenAI credentials ready.

---

## 1. Deploy the images

```bash
sh scripts/fly-deploy.sh
```

- [ ] App launched (first run only) and `fly deploy` succeeded.
- [ ] `fly status` shows machines for **both** `app` and `worker` process
      groups (`fly scale count app=1 worker=1` is run by the script).

---

## 2. Set secrets

```bash
fly secrets set INVITE_QUEUE_ENABLED=true
fly secrets set BULLMQ_REDIS_URL='rediss://...'
fly secrets set DATABASE_URL='...'
fly secrets set DIRECT_URL='...'
fly secrets set OPENAI_API_KEY='sk-...'
fly secrets set TWILIO_ACCOUNT_SID='AC...' TWILIO_AUTH_TOKEN='...' \
  TWILIO_WHATSAPP_FROM='whatsapp:+...'
```

- [ ] `INVITE_QUEUE_ENABLED=true` set.
- [ ] Redis URL set (`BULLMQ_REDIS_URL` / `UPSTASH_REDIS_URL` / `REDIS_URL`).
- [ ] DB + Twilio + OpenAI secrets set.
- [ ] Machines restarted after secrets (`fly secrets set` does this).

---

## 3. Apply migrations

```bash
pnpm db:migrate:deploy
```

- [ ] Migrations applied against prod DB.

---

## 4. Confirm the worker booted

```bash
fly logs -i <worker-machine-id>
```

- [ ] Logs show: `Workers started { sendQueue: 'invite-sends',
      phaseQueue: 'cascade-phase-events', ... }`.
- [ ] No "Worker not started: set INVITE_QUEUE_ENABLED=true..." message
      (that means the flag or Redis URL is missing).

---

## 5. Smoke-test with a real match

From your local machine (phones from `.env`):

```bash
pnpm test:pascal-invites-joris
```

- [ ] Phase-1 invite arrives on `+TEST_JORIS_PHONE` within seconds
      (enqueued at finalize, sent by the worker).
- [ ] Worker logs show the send job completing.
- [ ] Fallback phases fire when their delayed jobs mature (set small
      `fallbackLevelDelayMinutes` to verify in ~1 min).

---

## Done

When all boxes above are checked, the cascade is autonomous in prod:

- New matches → phase-1 invites enqueued at finalize, sent by the worker.
- After `fallbackLevelDelayMinutes` → phase-2 delayed job fires phase 2.
- After `+fallbackEveryoneDelayMinutes` → phase-3 delayed job fires phase 3.
- Failed Twilio sends → retried up to 5× by BullMQ, then dead-lettered to
  the failed set.
- Cancelling a match removes its pending jobs from both queues.

No further manual intervention needed.

---

## Rollback (if something breaks)

Fastest: stop the worker machine and let the app fall back to synchronous
inline sends.

```bash
fly scale count worker=0          # stop draining the queue
fly secrets set INVITE_QUEUE_ENABLED=false   # app sends inline at finalize
```

With the flag off, `dispatchOrEnqueueInvites` sends inline in the request,
so new matches still go out. Note: the worker's `main()` calls
`process.exit(1)` when the flag is off, so leaving the worker machine
scaled up with the flag false makes it crash-loop — scale it to 0 instead.
Any jobs already enqueued before rollback won't be drained until the worker
is back. App and DB stay healthy. Re-enable once fixed.
