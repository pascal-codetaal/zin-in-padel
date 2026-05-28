# Phase F — Deploy checklist

Step-by-step ops checklist to turn on the production cron. ~10 minutes
end-to-end. Tick boxes as you go.

Read `docs/phase-f-cron-setup.md` for the "why" behind each step.

---

## 0. Pre-flight

- [ ] App is deployed and reachable at a stable URL (note it down):
      `APP_URL = https://__________________`
- [ ] You have access to the **Supabase SQL editor** for the prod project.
- [ ] You have access to **Vercel env vars** (or whatever hosts the app).
- [ ] Phase E migrations already applied in prod (pgmq queue exists).
      Verify in SQL editor:
      ```sql
      select * from pgmq.list_queues();
      -- should include 'invite-sends'
      ```

---

## 1. Generate the secret

In a terminal:

```bash
openssl rand -hex 32
```

- [ ] Copy the output. Call it `CRON_SECRET`. Don't lose it — you need it
      in both Vercel and Supabase.

---

## 2. Set `CRON_SECRET` on Vercel

```bash
vercel env add CRON_SECRET production
# paste the value when prompted
vercel deploy --prod
```

- [ ] Env var added for **production** environment.
- [ ] App redeployed.

Sanity-check from your terminal (replace `APP_URL` and `CRON_SECRET`):

```bash
curl -i "$APP_URL/api/cron/cascade-tick"
# expect: HTTP/2 401  {"error":"unauthorized"}

curl -i -H "Authorization: Bearer $CRON_SECRET" "$APP_URL/api/cron/cascade-tick"
# expect: HTTP/2 200  {"ranAt":"...","matchesConsidered":0,"perMatch":[]}

curl -i -H "Authorization: Bearer $CRON_SECRET" "$APP_URL/api/cron/send-tick"
# expect: HTTP/2 200  trace JSON
```

- [ ] Without header: **401**.
- [ ] With header: **200** + JSON trace.

If either fails, stop here. Fix before continuing.

---

## 3. Stash URL + secret in Supabase Vault

In the Supabase SQL editor (prod project):

```sql
select vault.create_secret('https://your-app.vercel.app', 'app_base_url');
select vault.create_secret('paste-the-CRON_SECRET-here', 'cron_secret');
```

- [ ] `app_base_url` created (no trailing slash, includes `https://`).
- [ ] `cron_secret` created (same value as Vercel env).

Verify:

```sql
select name from vault.secrets where name in ('app_base_url', 'cron_secret');
-- expect 2 rows
```

---

## 4. Apply the cron migration

From your local machine, against the prod database:

```bash
pnpm db:migrate:deploy
# or, if the pooler URL doesn't work for DDL:
pnpm db:migrate:deploy:direct
```

- [ ] Migration `20260528120002_supabase_cron_rows` applied successfully.

Verify in SQL editor:

```sql
select jobname, schedule, active
from cron.job
where jobname in ('cascade-tick', 'send-tick');
-- expect 2 rows, both active=true, schedule='* * * * *'
```

- [ ] Two rows present, both active.

---

## 5. Watch the first runs

Wait ~90 seconds, then in SQL editor:

```sql
select j.jobname, d.status, d.return_message, d.start_time
from cron.job_run_details d
join cron.job j using (jobid)
where j.jobname in ('cascade-tick', 'send-tick')
order by d.start_time desc
limit 10;
```

- [ ] Both jobs show `status='succeeded'` for the most recent runs.
- [ ] No 401s, no timeout messages.

Then check Vercel logs — you should see one `runCascadeTick` and one
`runSendTick` invocation per minute.

- [ ] Vercel logs show both routes hit once per minute.

---

## 6. Smoke-test with a real match

From your local machine:

```bash
pnpm test:pascal-invites-joris
```

- [ ] Phase-1 invite arrives on `+TEST_JORIS_PHONE` within ~10s
      (driven by the inline dispatch, not cron yet).
- [ ] After ~60min the level-fallback (phase 2) audience is computed by
      `cascade-tick` automatically. (Or set `fallbackLevelDelayMinutes=1`
      in the script to verify in 1 min.)

---

## Done

When all boxes above are checked, the cascade is fully autonomous in prod:

- New matches → phase 1 dispatched inline at finalize.
- After `fallbackLevelDelayMinutes` → `cascade-tick` fires phase 2.
- After `fallbackEveryoneDelayMinutes` → `cascade-tick` fires phase 3.
- Failed Twilio sends → retried by `send-tick` until archived.

No further manual intervention needed.

---

## Rollback (if something breaks)

```sql
select cron.unschedule('cascade-tick');
select cron.unschedule('send-tick');
```

Cron stops firing immediately. App and DB stay healthy. Re-apply the
migration once you've fixed the issue.
