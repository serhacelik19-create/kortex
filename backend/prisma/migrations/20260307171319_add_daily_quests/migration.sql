-- CreateTable
CREATE TABLE "daily_quests" (
    "id" SERIAL NOT NULL,
    "student_id" INTEGER NOT NULL,
    "quest_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "target" INTEGER NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "is_completed" BOOLEAN NOT NULL DEFAULT false,
    "date" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_quests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "daily_quests_student_id_quest_id_date_key" ON "daily_quests"("student_id", "quest_id", "date");

-- AddForeignKey
ALTER TABLE "daily_quests" ADD CONSTRAINT "daily_quests_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
