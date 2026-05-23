/**
 * One-time copy of all rows from the local SQLite DB into Supabase Postgres.
 *
 * Prerequisites:
 *   - DATABASE_URL and DIRECT_URL in .env point at Supabase (see .env.example)
 *   - Schema applied: npm run db:migrate:deploy  (or db:push)
 *
 * Usage:
 *   SQLITE_DATABASE_URL="file:./data/app.db" npm run db:copy-sqlite
 */
import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const sqliteUrl =
  process.env.SQLITE_DATABASE_URL ?? "file:./data/app.db";
const postgresUrl = process.env.DATABASE_URL ?? "";

if (!postgresUrl.startsWith("postgresql://")) {
  console.error(
    "DATABASE_URL must be a postgresql:// connection string (Supabase pooler or direct).",
  );
  process.exit(1);
}

const source = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: sqliteUrl }),
});

const target = new PrismaClient({
  adapter: new PrismaPg(postgresUrl),
});

async function copyTable<T>(
  label: string,
  count: () => Promise<number>,
  write: () => Promise<{ count: number }>,
): Promise<void> {
  const n = await count();
  if (n === 0) {
    console.log(`  ${label}: (empty)`);
    return;
  }
  const result = await write();
  console.log(`  ${label}: ${result.count} rows`);
}

async function main(): Promise<void> {
  console.log("Copying SQLite → Postgres…");
  console.log(`  source: ${sqliteUrl}`);
  console.log(`  target: ${postgresUrl.replace(/:[^:@/]+@/, ":****@")}`);

  const clubs = await source.club.findMany({
    include: { playtomicAliases: true },
  });
  await copyTable("Club", () => Promise.resolve(clubs.length), () =>
    target.club.createMany({
      data: clubs.map(({ playtomicAliases: _a, ...c }) => c),
      skipDuplicates: true,
    }),
  );

  const aliases = clubs.flatMap((c) =>
    c.playtomicAliases.map((a) => ({
      clubId: a.clubId,
      alias: a.alias,
      aliasNormalized: a.aliasNormalized,
    })),
  );
  await copyTable("ClubPlaytomicAlias", () => Promise.resolve(aliases.length), () =>
    target.clubPlaytomicAlias.createMany({
      data: aliases,
      skipDuplicates: true,
    }),
  );

  const players = await source.player.findMany();
  await copyTable("Player", () => Promise.resolve(players.length), () =>
    target.player.createMany({ data: players, skipDuplicates: true }),
  );

  const users = await source.user.findMany();
  await copyTable("User", () => Promise.resolve(users.length), () =>
    target.user.createMany({ data: users, skipDuplicates: true }),
  );

  const favorites = await source.userFavorite.findMany();
  await copyTable("UserFavorite", () => Promise.resolve(favorites.length), () =>
    target.userFavorite.createMany({ data: favorites, skipDuplicates: true }),
  );

  const preferredClubs = await source.userPreferredClub.findMany();
  await copyTable(
    "UserPreferredClub",
    () => Promise.resolve(preferredClubs.length),
    () =>
      target.userPreferredClub.createMany({
        data: preferredClubs,
        skipDuplicates: true,
      }),
  );

  const matches = await source.match.findMany();
  await copyTable("Match", () => Promise.resolve(matches.length), () =>
    target.match.createMany({ data: matches, skipDuplicates: true }),
  );

  const invited = await source.matchInvitedPlayer.findMany();
  await copyTable(
    "MatchInvitedPlayer",
    () => Promise.resolve(invited.length),
    () =>
      target.matchInvitedPlayer.createMany({
        data: invited,
        skipDuplicates: true,
      }),
  );

  const accepted = await source.matchAcceptedPlayer.findMany();
  await copyTable(
    "MatchAcceptedPlayer",
    () => Promise.resolve(accepted.length),
    () =>
      target.matchAcceptedPlayer.createMany({
        data: accepted,
        skipDuplicates: true,
      }),
  );

  const slots = await source.matchConfirmedSlot.findMany();
  await copyTable(
    "MatchConfirmedSlot",
    () => Promise.resolve(slots.length),
    () =>
      target.matchConfirmedSlot.createMany({
        data: slots,
        skipDuplicates: true,
      }),
  );

  const messages = await source.message.findMany();
  await copyTable("Message", () => Promise.resolve(messages.length), () =>
    target.message.createMany({ data: messages, skipDuplicates: true }),
  );

  const games = await source.game.findMany();
  await copyTable("Game", () => Promise.resolve(games.length), () =>
    target.game.createMany({ data: games, skipDuplicates: true }),
  );

  console.log("Done.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await source.$disconnect();
    await target.$disconnect();
  });
