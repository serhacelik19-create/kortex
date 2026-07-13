CREATE TABLE "smart_quiz_attempts" (
  "id" TEXT NOT NULL,
  "student_id" INTEGER NOT NULL,
  "course" TEXT NOT NULL,
  "topic" TEXT NOT NULL,
  "reason" TEXT,
  "risk_label" TEXT,
  "cooldown_hours" INTEGER NOT NULL DEFAULT 24,
  "source_last_activity_at" TIMESTAMP(3) NOT NULL,
  "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'pending',
  "question_count" INTEGER NOT NULL DEFAULT 0,
  "explanation_count" INTEGER NOT NULL DEFAULT 0,
  "correct_count" INTEGER,
  "total_count" INTEGER,
  "score" DOUBLE PRECISION,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "smart_quiz_attempts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "smart_quiz_attempts_student_id_status_assigned_at_idx"
ON "smart_quiz_attempts"("student_id", "status", "assigned_at");

ALTER TABLE "smart_quiz_attempts"
ADD CONSTRAINT "smart_quiz_attempts_student_id_fkey"
FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
