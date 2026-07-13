-- CreateTable
CREATE TABLE "study_notes" (
    "id" TEXT NOT NULL,
    "student_id" INTEGER NOT NULL,
    "course" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "study_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "favorite_questions" (
    "id" TEXT NOT NULL,
    "student_id" INTEGER NOT NULL,
    "question_text" TEXT,
    "question_image" TEXT,
    "answer_text" TEXT NOT NULL,
    "course" TEXT,
    "timestamp" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorite_questions_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "study_notes" ADD CONSTRAINT "study_notes_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorite_questions" ADD CONSTRAINT "favorite_questions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
