import type { FastifyInstance } from "fastify";

import { prisma } from "../db/prisma.js";
import { dueSoonWindow, lastStudentDays, studentDayKey, todayFor, dateOnlyFromKey } from "../domain/dates.js";

export async function dashboardRoutes(app: FastifyInstance) {
  app.get("/dashboard/summary", async (request) => {
    const student = await app.requireStudent(request);
    const window = dueSoonWindow(student.timezone);
    const today = todayFor(student.timezone);
    const progressDays = lastStudentDays(student.timezone, 7);
    const progressStart = dateOnlyFromKey(progressDays[0]);

    const [dueSoonTasks, todayTasks, completedTasks, latestConversation] = await Promise.all([
      prisma.task.findMany({
        where: {
          studentId: student.id,
          deletedAt: null,
          completedAt: null,
          OR: [
            { dueDate: { lt: window.todayDate } },
            { dueDate: { gte: window.todayDate, lte: window.throughDate } },
          ],
        },
        include: { course: true },
        orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
      }),
      prisma.todayTask.findMany({
        where: { studentId: student.id, day: today },
        include: { task: { include: { course: true } } },
        orderBy: { createdAt: "asc" },
      }),
      prisma.task.findMany({
        where: {
          studentId: student.id,
          deletedAt: null,
          completedAt: { gte: progressStart },
        },
        include: { course: true },
      }),
      prisma.conversation.findFirst({
        where: { studentId: student.id, deletedAt: null },
        include: { messages: { orderBy: { createdAt: "desc" }, take: 1 } },
        orderBy: { updatedAt: "desc" },
      }),
    ]);

    const progress = progressDays.map((day) => {
      const tasks = completedTasks.filter(
        (task) => task.completedAt && studentDayKey(task.completedAt, student.timezone) === day,
      );
      const byCourse = new Map<string, { courseId: string | null; courseName: string | null; completedTasks: number }>();

      for (const task of tasks) {
        const key = task.courseId ?? "course-less";
        const existing = byCourse.get(key) ?? {
          courseId: task.courseId,
          courseName: task.course?.name ?? null,
          completedTasks: 0,
        };
        existing.completedTasks += 1;
        byCourse.set(key, existing);
      }

      return {
        day,
        completedTasks: tasks.length,
        byCourse: [...byCourse.values()],
      };
    });

    return {
      studentDay: window.today,
      dueSoonThrough: window.through,
      dueSoonTasks,
      todaysTasks: todayTasks.map((selection) => selection.task).filter((task) => !task.deletedAt),
      progress,
      latestConversation,
    };
  });
}
