-- Add institution code and student counter for deterministic username generation
ALTER TABLE "institutions"
  ADD COLUMN IF NOT EXISTS "code" VARCHAR(2),
  ADD COLUMN IF NOT EXISTS "student_counter" INTEGER NOT NULL DEFAULT 0;

-- Backfill institution code in deterministic order (10..99)
WITH ordered AS (
  SELECT id, LPAD((ROW_NUMBER() OVER (ORDER BY id) + 9)::text, 2, '0') AS new_code
  FROM "institutions"
)
UPDATE "institutions" i
SET "code" = o.new_code
FROM ordered o
WHERE i.id = o.id
  AND (i."code" IS NULL OR i."code" = '');

-- Normalize student usernames before adding unique index
UPDATE "students"
SET "username" = NULL
WHERE "username" IS NOT NULL
  AND BTRIM("username") = '';

WITH ranked AS (
  SELECT id, username, ROW_NUMBER() OVER (PARTITION BY username ORDER BY id) AS rn
  FROM "students"
  WHERE username IS NOT NULL
)
UPDATE "students" s
SET "username" = NULL
FROM ranked r
WHERE s.id = r.id
  AND r.rn > 1;

-- Align institution counters with existing generated-like usernames
WITH max_counters AS (
  SELECT s."institution_id" AS institution_id,
         MAX(CAST(RIGHT(s.username, 4) AS INTEGER)) AS max_counter
  FROM "students" s
  JOIN "institutions" i ON i.id = s."institution_id"
  WHERE s.username ~ '^[0-9]{6}$'
    AND LEFT(s.username, 2) = i."code"
  GROUP BY s."institution_id"
)
UPDATE "institutions" i
SET "student_counter" = COALESCE(mc.max_counter, 0)
FROM max_counters mc
WHERE i.id = mc.institution_id;

-- Guardrails
ALTER TABLE "institutions"
  ALTER COLUMN "code" SET NOT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "institutions" WHERE "code" !~ '^[0-9]{2}$') THEN
    RAISE EXCEPTION 'Institution codes must be exactly 2 digits.';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "institutions" GROUP BY "code" HAVING COUNT(*) > 1) THEN
    RAISE EXCEPTION 'Duplicate institution codes detected during migration.';
  END IF;
END $$;

ALTER TABLE "institutions"
  ADD CONSTRAINT "institutions_code_format_chk" CHECK ("code" ~ '^[0-9]{2}$');

CREATE UNIQUE INDEX IF NOT EXISTS "institutions_code_key" ON "institutions"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "students_username_key" ON "students"("username");
