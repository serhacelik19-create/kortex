-- CreateTable
CREATE TABLE "assigned_contents" (
    "id" SERIAL NOT NULL,
    "institution_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "content_type" TEXT NOT NULL,
    "course" TEXT,
    "exam_scope" TEXT,
    "teacher_note" TEXT,
    "expected_duration_minutes" INTEGER NOT NULL DEFAULT 90,
    "total_pages" INTEGER NOT NULL DEFAULT 1,
    "requires_optic" BOOLEAN NOT NULL DEFAULT true,
    "file_name" TEXT NOT NULL,
    "file_mime_type" TEXT NOT NULL DEFAULT 'application/pdf',
    "file_size_bytes" INTEGER,
    "file_data" BYTEA NOT NULL,
    "created_by_user_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assigned_contents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assigned_content_sections" (
    "id" SERIAL NOT NULL,
    "content_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "start_page" INTEGER NOT NULL,
    "end_page" INTEGER NOT NULL,
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assigned_content_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assigned_content_assignments" (
    "id" SERIAL NOT NULL,
    "content_id" INTEGER NOT NULL,
    "institution_id" INTEGER NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_value" TEXT,
    "due_at" TIMESTAMP(3) NOT NULL,
    "expected_duration_minutes" INTEGER NOT NULL DEFAULT 90,
    "completion_mode" TEXT NOT NULL DEFAULT 'virtual_optic',
    "note" TEXT,
    "assigned_by_user_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assigned_content_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assigned_content_recipients" (
    "id" SERIAL NOT NULL,
    "assignment_id" INTEGER NOT NULL,
    "student_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "opened_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "active_duration_seconds" INTEGER NOT NULL DEFAULT 0,
    "wall_duration_seconds" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assigned_content_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assigned_contents_institution_id_created_at_idx" ON "assigned_contents"("institution_id", "created_at");

-- CreateIndex
CREATE INDEX "assigned_content_sections_content_id_order_index_idx" ON "assigned_content_sections"("content_id", "order_index");

-- CreateIndex
CREATE INDEX "assigned_content_assignments_institution_id_created_at_idx" ON "assigned_content_assignments"("institution_id", "created_at");

-- CreateIndex
CREATE INDEX "assigned_content_assignments_content_id_idx" ON "assigned_content_assignments"("content_id");

-- CreateIndex
CREATE UNIQUE INDEX "assigned_content_recipients_assignment_id_student_id_key" ON "assigned_content_recipients"("assignment_id", "student_id");

-- CreateIndex
CREATE INDEX "assigned_content_recipients_student_id_status_created_at_idx" ON "assigned_content_recipients"("student_id", "status", "created_at");

-- AddForeignKey
ALTER TABLE "assigned_contents" ADD CONSTRAINT "assigned_contents_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assigned_content_sections" ADD CONSTRAINT "assigned_content_sections_content_id_fkey" FOREIGN KEY ("content_id") REFERENCES "assigned_contents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assigned_content_assignments" ADD CONSTRAINT "assigned_content_assignments_content_id_fkey" FOREIGN KEY ("content_id") REFERENCES "assigned_contents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assigned_content_assignments" ADD CONSTRAINT "assigned_content_assignments_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assigned_content_recipients" ADD CONSTRAINT "assigned_content_recipients_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assigned_content_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assigned_content_recipients" ADD CONSTRAINT "assigned_content_recipients_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
