ALTER TABLE "assigned_content_sections"
ADD COLUMN "course" TEXT,
ADD COLUMN "question_count" INTEGER,
ADD COLUMN "answer_key" JSONB;
