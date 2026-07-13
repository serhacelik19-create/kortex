-- CreateTable
CREATE TABLE "daily_activities" (
    "id" SERIAL NOT NULL,
    "student_id" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "solved_count" INTEGER NOT NULL DEFAULT 0,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_plan_topics" (
    "id" SERIAL NOT NULL,
    "student_id" INTEGER NOT NULL,
    "course" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "is_completed" BOOLEAN NOT NULL DEFAULT false,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "study_plan_topics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "daily_activities_student_id_date_key" ON "daily_activities"("student_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "study_plan_topics_student_id_course_topic_key" ON "study_plan_topics"("student_id", "course", "topic");

-- AddForeignKey
ALTER TABLE "daily_activities" ADD CONSTRAINT "daily_activities_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_plan_topics" ADD CONSTRAINT "study_plan_topics_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
