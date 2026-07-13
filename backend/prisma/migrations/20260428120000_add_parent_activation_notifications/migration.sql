CREATE TABLE IF NOT EXISTS "parent_activation_tokens" (
  "id" SERIAL PRIMARY KEY,
  "token_hash" TEXT NOT NULL UNIQUE,
  "student_id" INTEGER NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "institution_id" INTEGER NOT NULL REFERENCES "institutions"("id") ON DELETE CASCADE,
  "parent_phone" TEXT,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "used_at" TIMESTAMP(3),
  "created_by_user_id" INTEGER REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "parent_device_sessions" (
  "id" SERIAL PRIMARY KEY,
  "session_token_hash" TEXT NOT NULL UNIQUE,
  "student_id" INTEGER NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "institution_id" INTEGER NOT NULL REFERENCES "institutions"("id") ON DELETE CASCADE,
  "parent_phone" TEXT,
  "device_label" TEXT,
  "push_token" TEXT,
  "revoked_at" TIMESTAMP(3),
  "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "parent_notifications" (
  "id" SERIAL PRIMARY KEY,
  "institution_id" INTEGER NOT NULL REFERENCES "institutions"("id") ON DELETE CASCADE,
  "student_id" INTEGER REFERENCES "students"("id") ON DELETE CASCADE,
  "class_name" TEXT,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'general',
  "priority" TEXT NOT NULL DEFAULT 'normal',
  "created_by_user_id" INTEGER REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "parent_notification_receipts" (
  "id" SERIAL PRIMARY KEY,
  "notification_id" INTEGER NOT NULL REFERENCES "parent_notifications"("id") ON DELETE CASCADE,
  "parent_session_id" INTEGER NOT NULL REFERENCES "parent_device_sessions"("id") ON DELETE CASCADE,
  "delivered_at" TIMESTAMP(3),
  "read_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "parent_notification_receipts_notification_id_parent_session_id_key"
    UNIQUE ("notification_id", "parent_session_id")
);

CREATE INDEX IF NOT EXISTS "parent_activation_tokens_student_id_created_at_idx"
  ON "parent_activation_tokens"("student_id", "created_at");
CREATE INDEX IF NOT EXISTS "parent_activation_tokens_institution_id_expires_at_idx"
  ON "parent_activation_tokens"("institution_id", "expires_at");
CREATE INDEX IF NOT EXISTS "parent_device_sessions_student_id_revoked_at_idx"
  ON "parent_device_sessions"("student_id", "revoked_at");
CREATE INDEX IF NOT EXISTS "parent_device_sessions_institution_id_created_at_idx"
  ON "parent_device_sessions"("institution_id", "created_at");
CREATE INDEX IF NOT EXISTS "parent_notifications_institution_id_created_at_idx"
  ON "parent_notifications"("institution_id", "created_at");
CREATE INDEX IF NOT EXISTS "parent_notifications_student_id_created_at_idx"
  ON "parent_notifications"("student_id", "created_at");
CREATE INDEX IF NOT EXISTS "parent_notifications_class_name_created_at_idx"
  ON "parent_notifications"("class_name", "created_at");
CREATE INDEX IF NOT EXISTS "parent_notification_receipts_parent_session_id_read_at_idx"
  ON "parent_notification_receipts"("parent_session_id", "read_at");
