import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationSql = readFileSync(
  join(process.cwd(), "prisma", "migrations", "20260522130000_initial_persistence_baseline", "migration.sql"),
  "utf8",
);
const readme = readFileSync(join(process.cwd(), "README.md"), "utf8");

describe("Prisma persistence baseline", () => {
  it("has an initial PostgreSQL migration for the Student-owned domain records", () => {
    for (const table of [
      "Student",
      "Session",
      "Course",
      "Task",
      "TodayTask",
      "Conversation",
      "Message",
      "SuggestedTask",
    ]) {
      expect(migrationSql).toContain(`CREATE TABLE "${table}"`);
    }

    expect(migrationSql).toContain('CREATE TYPE "DueDateKind"');
    expect(migrationSql).toContain('CREATE TYPE "MessageAuthor"');
    expect(migrationSql).toContain('CREATE TYPE "SuggestedTaskState"');
  });

  it("uses partial unique indexes for active Course names and non-deleted Task titles", () => {
    expect(migrationSql).toContain(
      'CREATE UNIQUE INDEX "Course_active_studentId_name_key" ON "Course"("studentId", "name") WHERE "archivedAt" IS NULL',
    );
    expect(migrationSql).toContain(
      'CREATE UNIQUE INDEX "Task_active_studentId_courseId_title_key" ON "Task"("studentId", "courseId", "title") WHERE "deletedAt" IS NULL AND "courseId" IS NOT NULL',
    );
    expect(migrationSql).toContain(
      'CREATE UNIQUE INDEX "Task_active_studentId_title_no_course_key" ON "Task"("studentId", "title") WHERE "deletedAt" IS NULL AND "courseId" IS NULL',
    );
  });

  it("indexes session cleanup and Student-owned query paths", () => {
    for (const index of [
      'CREATE INDEX "Session_studentId_idx" ON "Session"("studentId")',
      'CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt")',
      'CREATE INDEX "Course_studentId_archivedAt_idx" ON "Course"("studentId", "archivedAt")',
      'CREATE INDEX "Task_studentId_deletedAt_completedAt_dueDate_idx" ON "Task"("studentId", "deletedAt", "completedAt", "dueDate")',
      'CREATE INDEX "Task_studentId_deletedAt_completedAt_dueAt_idx" ON "Task"("studentId", "deletedAt", "completedAt", "dueAt")',
      'CREATE INDEX "TodayTask_studentId_day_idx" ON "TodayTask"("studentId", "day")',
      'CREATE INDEX "Conversation_studentId_deletedAt_updatedAt_idx" ON "Conversation"("studentId", "deletedAt", "updatedAt")',
      'CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt")',
      'CREATE INDEX "SuggestedTask_conversationId_state_idx" ON "SuggestedTask"("conversationId", "state")',
    ]) {
      expect(migrationSql).toContain(index);
    }
  });

  it("documents local database setup and migration commands", () => {
    expect(readme).toContain("createdb aissistant");
    expect(readme).toContain("npm run prisma:generate");
    expect(readme).toContain("npm run prisma:migrate");
    expect(readme).toContain("npm run prisma:deploy");
  });
});
