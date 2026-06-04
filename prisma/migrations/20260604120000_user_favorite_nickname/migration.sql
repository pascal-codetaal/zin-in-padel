-- Per-user nickname for a favorite. Decouples the friend label from the shared
-- Player/User name so adding a friend no longer overwrites the canonical name.
ALTER TABLE "UserFavorite" ADD COLUMN "name" TEXT;
