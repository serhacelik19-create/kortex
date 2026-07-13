-- AlterTable
ALTER TABLE "students" ADD COLUMN     "ai_analysis" TEXT,
ADD COLUMN     "hard_topics" JSONB,
ADD COLUMN     "stress_level" INTEGER NOT NULL DEFAULT 0;
