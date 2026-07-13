-- AlterTable
ALTER TABLE "students" ADD COLUMN     "ai_comment" TEXT,
ADD COLUMN     "ai_hard_topics" TEXT,
ADD COLUMN     "ai_streak" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "ai_stress_level" INTEGER NOT NULL DEFAULT 0;
