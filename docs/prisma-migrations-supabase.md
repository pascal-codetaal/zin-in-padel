# Prisma migrations on Supabase

This project uses **Supabase Postgres** with Prisma. Some tooling behaves differently than a plain local Postgres setup.

## Day-to-day commands

| Task | Command |
|------|---------|
| Apply pending migrations (prod/staging) | `pnpm db:migrate:deploy` |
| Fix checksums after editing old migrations | `pnpm db:migrate:repair-checksums` |
| Generate Prisma client | `pnpm prisma:generate` |

Prefer **`db:migrate:deploy`** on Supabase. It does not use a shadow database.

## “Migration was modified after it was applied”

Prisma stores a SHA-256 checksum of each `migration.sql` in `_prisma_migrations`. If we fix an old migration file (e.g. add `pgcrypto`, skip Supabase extensions on shadow DBs), checksums no longer match.

**Fix (safe, no data loss):**

```bash
pnpm db:migrate:repair-checksums
```

That updates checksums in Supabase to match the files in `prisma/migrations/`.

## “Drift detected” and `mastra_*` tables

Mastra Memory (`@mastra/pg`) creates many `mastra_*` tables in the **same** database as the app. Those tables are **not** in Prisma migrations, so `prisma migrate dev` always reports drift when it compares:

- **Expected:** replay all migrations on an empty DB  
- **Actual:** your Supabase DB (app tables + `mastra_*`)

This is expected. **Do not run `prisma migrate reset` on Supabase** to “fix” drift.

### Creating schema changes without `migrate dev`

1. Edit `prisma/schema.prisma`.
2. Generate SQL:

   ```bash
   pnpm prisma migrate diff \
     --from-migrations ./prisma/migrations \
     --to-schema-datamodel ./prisma/schema.prisma \
     --script
   ```

3. Save output as `prisma/migrations/YYYYMMDDHHMMSS_description/migration.sql`.
4. Apply: `pnpm db:migrate:deploy`.

### Optional: make `migrate dev` usable again

Only if you need the interactive dev flow:

- Use a **separate database** for Mastra (`MASTRA_MEMORY_DB_URL`), **or**
- Accept drift and use `migrate diff` + `migrate deploy` (recommended here).

## Supabase-only migrations

These migrations no-op on Prisma shadow DBs and run on real Supabase:

- `20260528120001_invite_send_queue_supabase` — `pgmq`, `pg_cron`, …
- `20260528120002_supabase_cron_rows` — cron jobs (needs Vault secrets)

> These two migrations are kept for history. The invite queue now runs on
> BullMQ + Redis (ADR-0005), so the `pgmq`/`pg_cron` objects they create are
> operationally unused — still apply/resolve them so migration state stays
> consistent.

On vanilla Postgres, mark them applied without running:

```bash
pnpm prisma migrate resolve --applied 20260528120001_invite_send_queue_supabase
pnpm prisma migrate resolve --applied 20260528120002_supabase_cron_rows
```

## Line endings

Migration checksums depend on exact file bytes. `prisma/migrations/**/migration.sql` is forced to LF in `.gitattributes` so Windows/macOS clones stay in sync.
