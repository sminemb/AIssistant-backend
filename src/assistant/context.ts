import type { PrismaClient, Student } from "@prisma/client";

import type { AssistantContext } from "./provider.js";
import { dueSoonWindow, todayFor } from "../domain/dates.js";

export async function buildAssistantContext(
  prisma: PrismaClient,
  student: Student,
  conversationId: string,
): Promise<AssistantContext> {
  const window = dueSoonWindow(student.timezone);
  const today = todayFor(student.timezone);

  const dueSoonTasks = await prisma.task.findMany({
    where: {
      studentId: student.id,
      deletedAt: null,
      completedAt: null,
      OR: [
        { dueDate: { lt: window.todayDate } },
        { dueDate: { gte: window.todayDate, lte: window.throughDate } },
      ],
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
  });

  const todaySelections = await prisma.todayTask.findMany({
    where: { studentId: student.id, day: today },
    include: { task: true },
    orderBy: { createdAt: "asc" },
  });
  const todaysTasks = todaySelections
    .map((selection) => selection.task)
    .filter((task) => !task.deletedAt);

  const courseIds = [...new Set([...dueSoonTasks, ...todaysTasks].map((task) => task.courseId).filter(Boolean))] as string[];
  const courses =
    courseIds.length === 0
      ? []
      : await prisma.course.findMany({
          where: { studentId: student.id, id: { in: courseIds } },
          orderBy: { name: "asc" },
        });

  const recentMessages = await prisma.message.findMany({
    where: { studentId: student.id, conversationId },
    orderBy: { createdAt: "desc" },
    take: 12,
  });

  return {
    courses: courses.map((course) => ({
      id: course.id,
      name: course.name,
      archivedAt: course.archivedAt,
    })),
    dueSoonTasks,
    todaysTasks,
    recentMessages: recentMessages.reverse().map((message) => ({
      author: message.author,
      content: message.content,
    })),
  };
}
