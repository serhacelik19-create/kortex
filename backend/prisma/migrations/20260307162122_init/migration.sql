-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "role" TEXT,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "students" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "class" TEXT,
    "target" TEXT,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "solved_count" INTEGER NOT NULL DEFAULT 0,
    "lastSeen" TEXT DEFAULT 'Şimdi',
    "trend" TEXT DEFAULT 'stable',
    "username" TEXT,
    "password" TEXT,
    "report_status" TEXT DEFAULT 'pending',
    "last_report" TEXT,
    "parent_name" TEXT,
    "parent_phone" TEXT,

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exams" (
    "id" SERIAL NOT NULL,
    "student_id" INTEGER NOT NULL,
    "date" TEXT,
    "tyt_net" DOUBLE PRECISION,
    "tyt_tur" DOUBLE PRECISION DEFAULT 0,
    "tyt_mat" DOUBLE PRECISION DEFAULT 0,
    "tyt_tar" DOUBLE PRECISION DEFAULT 0,
    "tyt_cog" DOUBLE PRECISION DEFAULT 0,
    "tyt_fel" DOUBLE PRECISION DEFAULT 0,
    "tyt_din" DOUBLE PRECISION DEFAULT 0,
    "tyt_fiz" DOUBLE PRECISION DEFAULT 0,
    "tyt_kim" DOUBLE PRECISION DEFAULT 0,
    "tyt_biy" DOUBLE PRECISION DEFAULT 0,
    "ayt_net" DOUBLE PRECISION,
    "ayt_mat" DOUBLE PRECISION DEFAULT 0,
    "ayt_fiz" DOUBLE PRECISION DEFAULT 0,
    "ayt_kim" DOUBLE PRECISION DEFAULT 0,
    "ayt_biy" DOUBLE PRECISION DEFAULT 0,
    "ayt_edb" DOUBLE PRECISION DEFAULT 0,
    "ayt_tar1" DOUBLE PRECISION DEFAULT 0,
    "ayt_cog1" DOUBLE PRECISION DEFAULT 0,
    "ayt_tar2" DOUBLE PRECISION DEFAULT 0,
    "ayt_cog2" DOUBLE PRECISION DEFAULT 0,
    "ayt_fel" DOUBLE PRECISION DEFAULT 0,
    "ayt_din" DOUBLE PRECISION DEFAULT 0,

    CONSTRAINT "exams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" SERIAL NOT NULL,
    "hour" TEXT,
    "questions" INTEGER,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guidance_alerts" (
    "id" SERIAL NOT NULL,
    "student" TEXT,
    "issue" TEXT,
    "priority" TEXT,

    CONSTRAINT "guidance_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dashboard_meta" (
    "key" TEXT NOT NULL,
    "value" TEXT,

    CONSTRAINT "dashboard_meta_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "wrong_topics" (
    "topic" TEXT NOT NULL,
    "count" INTEGER,

    CONSTRAINT "wrong_topics_pkey" PRIMARY KEY ("topic")
);

-- CreateTable
CREATE TABLE "drop_students" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "drop_rate" TEXT,
    "type" TEXT,

    CONSTRAINT "drop_students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classes" (
    "name" TEXT NOT NULL,

    CONSTRAINT "classes_pkey" PRIMARY KEY ("name")
);

-- CreateTable
CREATE TABLE "subject_averages" (
    "subject" TEXT NOT NULL,
    "average_value" INTEGER NOT NULL,

    CONSTRAINT "subject_averages_pkey" PRIMARY KEY ("subject")
);

-- CreateTable
CREATE TABLE "tyt_ayt_dist" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "value" INTEGER,
    "color" TEXT,

    CONSTRAINT "tyt_ayt_dist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
