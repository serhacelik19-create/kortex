ALTER TABLE "ai_telemetry_events"
  ADD COLUMN IF NOT EXISTS "student_id" INTEGER,
  ADD COLUMN IF NOT EXISTS "actor_type" TEXT,
  ADD COLUMN IF NOT EXISTS "surface" TEXT,
  ADD COLUMN IF NOT EXISTS "feature" TEXT,
  ADD COLUMN IF NOT EXISTS "request_group_id" TEXT,
  ADD COLUMN IF NOT EXISTS "provider" TEXT,
  ADD COLUMN IF NOT EXISTS "model" TEXT,
  ADD COLUMN IF NOT EXISTS "prompt_tokens" INTEGER,
  ADD COLUMN IF NOT EXISTS "completion_tokens" INTEGER,
  ADD COLUMN IF NOT EXISTS "reasoning_tokens" INTEGER,
  ADD COLUMN IF NOT EXISTS "total_tokens" INTEGER,
  ADD COLUMN IF NOT EXISTS "input_cost_usd" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "output_cost_usd" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "total_cost_usd" DOUBLE PRECISION;

CREATE INDEX IF NOT EXISTS "ai_telemetry_events_student_id_created_at_idx"
  ON "ai_telemetry_events"("student_id", "created_at");

CREATE INDEX IF NOT EXISTS "ai_telemetry_events_surface_created_at_idx"
  ON "ai_telemetry_events"("surface", "created_at");

CREATE INDEX IF NOT EXISTS "ai_telemetry_events_feature_created_at_idx"
  ON "ai_telemetry_events"("feature", "created_at");
