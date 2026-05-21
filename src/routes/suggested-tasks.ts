import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { prisma } from "../db/prisma.js";
import { assertTaskTitleAvailable } from "../domain/tasks.js";
import { HttpError } from "../http/errors.js";
import { parseParams } from "../http/validation.js";

const suggestedTaskParamsSchema = z.object({ suggestedTaskId: z.string().uuid() });

async function findOwnedSuggestedTask(studentId: string, suggestedTaskId: string) {
  const suggestedTask = await prisma.suggestedTask.findFirst({
    where: { id: suggestedTaskId, studentId },
  });

  if (!suggestedTask) {
    throw new HttpError(404, "SUGGESTED_TASK_NOT_FOUND", "Suggested Task not found");
  }

  return suggestedTask;
}

export async function suggestedTasksRoutes(app: FastifyInstance) {
  app.post("/suggested-tasks/:suggestedTaskId/confirm", async (request) => {
    const student = await app.requireStudent(request);
    const params = parseParams(request, suggestedTaskParamsSchema);
    const suggestedTask = await findOwnedSuggestedTask(student.id, params.suggestedTaskId);

    if (suggestedTask.state !== "PENDING") {
      throw new HttpError(409, "SUGGESTED_TASK_NOT_PENDING", "Only pending Suggested Tasks can be confirmed");
    }

    await assertTaskTitleAvailable(prisma, student.id, suggestedTask.courseId, suggestedTask.title);

    const result = await prisma.$transaction(async (tx) => {
      const task = await tx.task.create({
        data: {
          studentId: student.id,
          courseId: suggestedTask.courseId,
          title: suggestedTask.title,
          notes: suggestedTask.notes,
          dueDateKind: suggestedTask.dueDateKind,
          dueDate: suggestedTask.dueDate,
          dueAt: suggestedTask.dueAt,
        },
        include: { course: true },
      });

      const confirmedSuggestedTask = await tx.suggestedTask.update({
        where: { id: suggestedTask.id },
        data: { state: "CONFIRMED", createdTaskId: task.id },
        include: { course: true, createdTask: true },
      });

      return { task, suggestedTask: confirmedSuggestedTask };
    });

    return result;
  });

  app.post("/suggested-tasks/:suggestedTaskId/dismiss", async (request) => {
    const student = await app.requireStudent(request);
    const params = parseParams(request, suggestedTaskParamsSchema);
    const suggestedTask = await findOwnedSuggestedTask(student.id, params.suggestedTaskId);

    if (suggestedTask.state !== "PENDING") {
      throw new HttpError(409, "SUGGESTED_TASK_NOT_PENDING", "Only pending Suggested Tasks can be dismissed");
    }

    return {
      suggestedTask: await prisma.suggestedTask.update({
        where: { id: suggestedTask.id },
        data: { state: "DISMISSED" },
        include: { course: true },
      }),
    };
  });
}
