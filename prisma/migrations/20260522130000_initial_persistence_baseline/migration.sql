-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "DueDateKind" AS ENUM ('DATE_ONLY', 'DATE_TIME');

-- CreateEnum
CREATE TYPE "MessageAuthor" AS ENUM ('STUDENT', 'ASSISTANT');

-- CreateEnum
CREATE TYPE "SuggestedTaskState" AS ENUM ('PENDING', 'CONFIRMED', 'DISMISSED');

-- CreateTable
CREATE TABLE "Student" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "avatarColor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Student_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "courseId" TEXT,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "dueDateKind" "DueDateKind",
    "dueDate" DATE,
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TodayTask" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TodayTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "courseId" TEXT,
    "title" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "author" "MessageAuthor" NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuggestedTask" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "courseId" TEXT,
    "createdTaskId" TEXT,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "dueDateKind" "DueDateKind",
    "dueDate" DATE,
    "dueAt" TIMESTAMP(3),
    "state" "SuggestedTaskState" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SuggestedTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Student_email_key" ON "Student"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_studentId_idx" ON "Session"("studentId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "Course_studentId_idx" ON "Course"("studentId");

-- CreateIndex
CREATE INDEX "Course_studentId_archivedAt_idx" ON "Course"("studentId", "archivedAt");

-- Active Course names are unique per Student, while archived Courses do not reserve names.
CREATE UNIQUE INDEX "Course_active_studentId_name_key" ON "Course"("studentId", "name") WHERE "archivedAt" IS NULL;

-- CreateIndex
CREATE INDEX "Task_studentId_idx" ON "Task"("studentId");

-- CreateIndex
CREATE INDEX "Task_studentId_courseId_idx" ON "Task"("studentId", "courseId");

-- CreateIndex
CREATE INDEX "Task_studentId_deletedAt_idx" ON "Task"("studentId", "deletedAt");

-- CreateIndex
CREATE INDEX "Task_studentId_completedAt_idx" ON "Task"("studentId", "completedAt");

-- CreateIndex
CREATE INDEX "Task_studentId_deletedAt_completedAt_dueDate_idx" ON "Task"("studentId", "deletedAt", "completedAt", "dueDate");

-- CreateIndex
CREATE INDEX "Task_studentId_deletedAt_completedAt_dueAt_idx" ON "Task"("studentId", "deletedAt", "completedAt", "dueAt");

-- Non-deleted Task titles are unique per Student within a Course.
CREATE UNIQUE INDEX "Task_active_studentId_courseId_title_key" ON "Task"("studentId", "courseId", "title") WHERE "deletedAt" IS NULL AND "courseId" IS NOT NULL;

-- Non-deleted course-less Task titles are unique per Student in their own group.
CREATE UNIQUE INDEX "Task_active_studentId_title_no_course_key" ON "Task"("studentId", "title") WHERE "deletedAt" IS NULL AND "courseId" IS NULL;

-- CreateIndex
CREATE INDEX "TodayTask_studentId_day_idx" ON "TodayTask"("studentId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "TodayTask_studentId_taskId_day_key" ON "TodayTask"("studentId", "taskId", "day");

-- CreateIndex
CREATE INDEX "Conversation_studentId_idx" ON "Conversation"("studentId");

-- CreateIndex
CREATE INDEX "Conversation_studentId_deletedAt_idx" ON "Conversation"("studentId", "deletedAt");

-- CreateIndex
CREATE INDEX "Conversation_studentId_deletedAt_updatedAt_idx" ON "Conversation"("studentId", "deletedAt", "updatedAt");

-- CreateIndex
CREATE INDEX "Message_studentId_idx" ON "Message"("studentId");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "SuggestedTask_studentId_idx" ON "SuggestedTask"("studentId");

-- CreateIndex
CREATE INDEX "SuggestedTask_conversationId_idx" ON "SuggestedTask"("conversationId");

-- CreateIndex
CREATE INDEX "SuggestedTask_studentId_state_idx" ON "SuggestedTask"("studentId", "state");

-- CreateIndex
CREATE INDEX "SuggestedTask_conversationId_state_idx" ON "SuggestedTask"("conversationId", "state");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TodayTask" ADD CONSTRAINT "TodayTask_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TodayTask" ADD CONSTRAINT "TodayTask_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuggestedTask" ADD CONSTRAINT "SuggestedTask_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuggestedTask" ADD CONSTRAINT "SuggestedTask_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuggestedTask" ADD CONSTRAINT "SuggestedTask_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuggestedTask" ADD CONSTRAINT "SuggestedTask_createdTaskId_fkey" FOREIGN KEY ("createdTaskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
