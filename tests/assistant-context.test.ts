import { afterEach, describe, expect, it, vi } from "vitest";

import { buildAssistantContext } from "../src/assistant/context.js";

const student = {
  id: "student-1",
  email: "student@example.com",
  passwordHash: "hash",
  displayName: "Ada Student",
  timezone: "Asia/Manila",
  avatarColor: null,
  createdAt: new Date("2026-05-01T00:00:00.000Z"),
  updatedAt: new Date("2026-05-01T00:00:00.000Z"),
};

function task(overrides: Record<string, unknown>) {
  return {
    id: "task-id",
    studentId: student.id,
    courseId: null,
    title: "Task",
    notes: null,
    dueDateKind: null,
    dueDate: null,
    dueAt: null,
    completedAt: null,
    deletedAt: null,
    createdAt: new Date("2026-05-01T00:00:00.000Z"),
    updatedAt: new Date("2026-05-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("Assistant Context", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("selects relevant Courses, Due Soon Tasks, Today's Tasks, and recent Messages only", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-05-21T16:30:00.000Z"));

    const biology = {
      id: "biology-course",
      studentId: student.id,
      name: "Biology",
      archivedAt: new Date("2026-05-01T00:00:00.000Z"),
      createdAt: new Date("2026-05-01T00:00:00.000Z"),
      updatedAt: new Date("2026-05-01T00:00:00.000Z"),
    };
    const chemistry = {
      id: "chemistry-course",
      studentId: student.id,
      name: "Chemistry",
      archivedAt: null,
      createdAt: new Date("2026-05-01T00:00:00.000Z"),
      updatedAt: new Date("2026-05-01T00:00:00.000Z"),
    };
    const unrelated = {
      id: "unrelated-course",
      studentId: student.id,
      name: "Unrelated",
      archivedAt: null,
      createdAt: new Date("2026-05-01T00:00:00.000Z"),
      updatedAt: new Date("2026-05-01T00:00:00.000Z"),
    };
    const dueSoonTask = task({
      id: "due-soon-task",
      courseId: biology.id,
      title: "Lab report",
      dueDate: new Date("2026-05-23T00:00:00.000Z"),
    });
    const todaysTask = task({
      id: "todays-task",
      courseId: chemistry.id,
      title: "Chemistry review",
    });
    const deletedTodayTask = task({
      id: "deleted-today-task",
      courseId: unrelated.id,
      title: "Deleted focus",
      deletedAt: new Date("2026-05-21T00:00:00.000Z"),
    });
    const currentMessages = Array.from({ length: 13 }, (_, index) => ({
      id: `message-${index}`,
      studentId: student.id,
      conversationId: "conversation-1",
      author: index % 2 === 0 ? "STUDENT" : "ASSISTANT",
      content: `current message ${index}`,
      createdAt: new Date(`2026-05-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`),
    }));
    const otherConversationMessage = {
      id: "other-message",
      studentId: student.id,
      conversationId: "conversation-2",
      author: "STUDENT",
      content: "other conversation",
      createdAt: new Date("2026-05-22T00:00:00.000Z"),
    };

    const prisma = {
      task: {
        findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
          expect(where).toMatchObject({
            studentId: student.id,
            deletedAt: null,
            completedAt: null,
          });
          return [dueSoonTask];
        }),
      },
      todayTask: {
        findMany: vi.fn(async ({ where, include }: { where: Record<string, unknown>; include: { task: boolean } }) => {
          expect(where).toEqual({ studentId: student.id, day: new Date("2026-05-22T00:00:00.000Z") });
          expect(include).toEqual({ task: true });
          return [
            { id: "today-1", studentId: student.id, taskId: todaysTask.id, day: where.day, createdAt: new Date(), task: todaysTask },
            {
              id: "today-2",
              studentId: student.id,
              taskId: deletedTodayTask.id,
              day: where.day,
              createdAt: new Date(),
              task: deletedTodayTask,
            },
          ];
        }),
      },
      course: {
        findMany: vi.fn(async ({ where, orderBy }: { where: { studentId: string; id: { in: string[] } }; orderBy: { name: string } }) => {
          expect(where).toEqual({
            studentId: student.id,
            id: { in: [biology.id, chemistry.id] },
          });
          expect(orderBy).toEqual({ name: "asc" });
          return [biology, chemistry];
        }),
      },
      message: {
        findMany: vi.fn(async ({ where, orderBy, take }: { where: Record<string, unknown>; orderBy: { createdAt: string }; take: number }) => {
          expect(where).toEqual({ studentId: student.id, conversationId: "conversation-1" });
          expect(orderBy).toEqual({ createdAt: "desc" });
          expect(take).toBe(12);
          return [...currentMessages, otherConversationMessage]
            .filter((message) => message.conversationId === "conversation-1")
            .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
            .slice(0, 12);
        }),
      },
    };

    const context = await buildAssistantContext(prisma as never, student as never, "conversation-1");

    expect(context.courses).toEqual([
      { id: biology.id, name: "Biology", archivedAt: biology.archivedAt },
      { id: chemistry.id, name: "Chemistry", archivedAt: null },
    ]);
    expect(context.dueSoonTasks).toEqual([dueSoonTask]);
    expect(context.todaysTasks).toEqual([todaysTask]);
    expect(context.recentMessages.map((message) => message.content)).toEqual([
      "current message 1",
      "current message 2",
      "current message 3",
      "current message 4",
      "current message 5",
      "current message 6",
      "current message 7",
      "current message 8",
      "current message 9",
      "current message 10",
      "current message 11",
      "current message 12",
    ]);
  });
});
