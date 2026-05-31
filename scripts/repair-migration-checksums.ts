/**
 * Re-sync `_prisma_migrations.checksum` with the current migration.sql files.
 *
 * Run after editing already-applied migrations (e.g. pgcrypto / shadow-DB fixes):
 *   pnpm db:migrate:repair-checksums
 *
 * Requires DIRECT_URL in .env (same as prisma.config.ts).
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const migrationsDir = join(process.cwd(), "prisma/migrations");

function migrationChecksum(name: string): string {
  const sqlPath = join(migrationsDir, name, "migration.sql");
  const sql = readFileSync(sqlPath, "utf8");
  return createHash("sha256").update(sql).digest("hex");
}

function listMigrations(): string[] {
  return readdirSync(migrationsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^\d{14}_/.test(e.name))
    .map((e) => e.name)
    .sort();
}

async function main() {
  const url = process.env.DIRECT_URL;
  if (!url) {
    console.error("DIRECT_URL is not set. Load .env or export DIRECT_URL.");
    process.exit(1);
  }

  const names = listMigrations();
  const client = new pg.Client({ connectionString: url });
  await client.connect();

  try {
    for (const name of names) {
      const checksum = migrationChecksum(name);
      const result = await client.query(
        `UPDATE "_prisma_migrations"
         SET "checksum" = $1
         WHERE "migration_name" = $2`,
        [checksum, name],
      );
      if (result.rowCount === 0) {
        console.log(`skip  ${name} (not in _prisma_migrations)`);
      } else {
        console.log(`fixed ${name}`);
      }
    }
    console.log("\nDone. Re-run: pnpm prisma migrate dev");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
