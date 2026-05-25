-- Structured display names: voornaam + familienaam
ALTER TABLE "User" ADD COLUMN "firstName" TEXT;
ALTER TABLE "User" ADD COLUMN "lastName" TEXT;

-- Backfill from profileName (first token + remainder)
UPDATE "User"
SET
  "firstName" = split_part(trim("profileName"), ' ', 1),
  "lastName" = NULLIF(
    trim(substring(trim("profileName") from length(split_part(trim("profileName"), ' ', 1)) + 2)),
    ''
  )
WHERE trim("profileName") <> '';
