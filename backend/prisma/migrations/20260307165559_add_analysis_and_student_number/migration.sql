/*
  Warnings:

  - You are about to drop the column `ai_analysis` on the `students` table. All the data in the column will be lost.
  - You are about to drop the column `hard_topics` on the `students` table. All the data in the column will be lost.
  - You are about to drop the column `stress_level` on the `students` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[student_number]` on the table `students` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "students" DROP COLUMN "ai_analysis",
DROP COLUMN "hard_topics",
DROP COLUMN "stress_level",
ADD COLUMN     "student_number" TEXT;

-- CreateTable
CREATE TABLE "question_analyses" (
    "id" SERIAL NOT NULL,
    "student_id" INTEGER NOT NULL,
    "course" TEXT,
    "topic" TEXT,
    "subtopic" TEXT,
    "difficulty" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "students_student_number_key" ON "students"("student_number");

-- AddForeignKey
ALTER TABLE "question_analyses" ADD CONSTRAINT "question_analyses_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
