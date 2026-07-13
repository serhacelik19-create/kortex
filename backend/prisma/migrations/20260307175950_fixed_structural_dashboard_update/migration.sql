/*
  Warnings:

  - You are about to drop the column `student` on the `guidance_alerts` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "drop_students" ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "student_id" INTEGER;

-- AlterTable
ALTER TABLE "guidance_alerts" DROP COLUMN "student",
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "student_id" INTEGER,
ADD COLUMN     "student_name" TEXT;

-- AddForeignKey
ALTER TABLE "guidance_alerts" ADD CONSTRAINT "guidance_alerts_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drop_students" ADD CONSTRAINT "drop_students_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;
