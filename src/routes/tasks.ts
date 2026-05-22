import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { prisma } from "../db/prisma.js";
import { todayFor } from "../domain/dates.js";
import { assertCourseBelongsToStudent, assertTaskTitleAvailable, parseDueInput } from "../domain/tasks.js";
import { HttpError } from "../http/errors.js";
import { parseBody, parseParams, parseQuery } from "../http/validation.js";

const taskParamsSchema = z.object({ taskId: z.string().uuid() });

const taskDueSchema = {
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dueAt: z.string().datetime().optional(),
};

const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  notes: z.string().trim().max(4000).optional(),
  courseId: z.string().uuid().nullable().optional(),
  ...taskDueSchema,
});

const updateTaskSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
  courseId: z.string().uuid().nullable().optional(),
  dueDate: taskDueSchema.dueDate.nullable().optional(),
  dueAt: taskDueSchema.dueAt.nullable().optional(),
});

const listTasksSchema = z.object({
  includeDeleted: z.coerce.boolean().default(false),
  courseId: z.string().uuid().optional(),
});

async function findOwnedTask(studentId: string, taskId: string) {
  const task = await prisma.task.findFirst({ where: { id: taskId, studentId } });
  if (!task) {
    throw new HttpError(404, "TASK_NOT_FOUND", "Task not found");
  }
  return task;
}

export async function tasksRoutes(app: FastifyInstance) {
  app.get("/tasks", async (request) => {
    const student = await app.requireStudent(request);
    const query = parseQuery(request, listTasksSchema);

    const tasks = await prisma.task.findMany({
      where: {
        studentId: student.id,
        deletedAt: query.includeDeleted ? undefined : null,
        courseId: query.courseId,
      },
      include: { course: true },
      orderBy: [{ completedAt: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
    });

    return { tasks };
  });

  app.post("/tasks", async (request, reply) => {
    const student = await app.requireStudent(request);
    const body = parseBody(request, createTaskSchema);
    const courseId = body.courseId ?? null;

    await assertCourseBelongsToStudent(prisma, student.id, courseId);
    await assertTaskTitleAvailable(prisma, student.id, courseId, body.title);

    const due = parseDueInput(body, student.timezone);
    const task = await prisma.task.create({
      data: {
        studentId: student.id,
        courseId,
        title: body.title,
        notes: body.notes,
        ...due,
      },
      include: { course: true },
    });

    return reply.status(201).send({ task });
  });

  app.patch("/tasks/:taskId", async (request) => {
    const student = await app.requireStudent(request);
    const params = parseParams(request, taskParamsSchema);
    const body = parseBody(request, updateTaskSchema);
    const task = await findOwnedTask(student.id, params.taskId);

    if (task.deletedAt) {
      throw new HttpError(409, "TASK_DELETED", "Deleted Tasks cannot be updated");
    }

    const nextCourseId = Object.hasOwn(body, "courseId") ? body.courseId ?? null : task.courseId;
    const nextTitle = body.title ?? task.title;

    await assertCourseBelongsToStudent(prisma, student.id, nextCourseId);
    await assertTaskTitleAvailable(prisma, student.id, nextCourseId, nextTitle, task.id);

    const duePatch =
      Object.hasOwn(body, "dueAt") || Object.hasOwn(body, "dueDate")
        ? parseDueInput(
            {
              dueAt: body.dueAt ?? undefined,
              dueDate: body.dueDate ?? undefined,
            },
            student.timezone,
          )
        : {};

    return {
      task: await prisma.task.update({
        where: { id: task.id },
        data: {
          title: body.title,
          notes: body.notes,
          courseId: nextCourseId,
          ...duePatch,
        },
        include: { course: true },
      }),
    };
  });

  app.post("/tasks/:taskId/complete", async (request) => {
    const student = await app.requireStudent(request);
    const params = parseParams(request, taskParamsSchema);
    const task = await findOwnedTask(student.id, params.taskId);

    if (task.deletedAt) {
      throw new HttpError(409, "TASK_DELETED", "Deleted Tasks cannot be completed");
    }

    return {
      task: await prisma.task.update({
        where: { id: task.id },
        data: { completedAt: task.completedAt ?? new Date() },
        include: { course: true },
      }),
    };
  });

  app.post("/tasks/:taskId/reopen", async (request) => {
    const student = await app.requireStudent(request);
    const params = parseParams(request, taskParamsSchema);
    const task = await findOwnedTask(student.id, params.taskId);

    if (task.deletedAt) {
      throw new HttpError(409, "TASK_DELETED", "Deleted Tasks cannot be reopened");
    }

    return {
      task: await prisma.task.update({
        where: { id: task.id },
        data: { completedAt: null },
        include: { course: true },
      }),
    };
  });

  app.delete("/tasks/:taskId", async (request, reply) => {
    const student = await app.requireStudent(request);
    const params = parseParams(request, taskParamsSchema);
    const task = await findOwnedTask(student.id, params.taskId);

    if (!task.deletedAt) {
      await prisma.task.update({
        where: { id: task.id },
        data: { deletedAt: new Date() },
      });
    }

    return reply.status(204).send();
  });

  app.get("/today-tasks", async (request) => {
    const student = await app.requireStudent(request);
    const query = parseQuery(
      request,
      z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }),
    );
    const day = query.day ? new Date(`${query.day}T00:00:00.000Z`) : todayFor(student.timezone);

    const todayTasks = await prisma.todayTask.findMany({
      where: { studentId: student.id, day, task: { deletedAt: null } },
      include: { task: { include: { course: true } } },
      orderBy: { createdAt: "asc" },
    });

    return { todayTasks };
  });

  app.post("/today-tasks", async (request, reply) => {
    const student = await app.requireStudent(request);
    const body = parseBody(
      request,
      z.object({
        taskId: z.string().uuid(),
        day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      }),
    );
    const task = await findOwnedTask(student.id, body.taskId);
    if (task.deletedAt) {
      throw new HttpError(409, "TASK_DELETED", "Deleted Tasks cannot be selected for today");
    }

    const day = body.day ? new Date(`${body.day}T00:00:00.000Z`) : todayFor(student.timezone);
    const todayTask = await prisma.todayTask.upsert({
      where: { studentId_taskId_day: { studentId: student.id, taskId: task.id, day } },
      update: {},
      create: { studentId: student.id, taskId: task.id, day },
      include: { task: { include: { course: true } } },
    });

    return reply.status(201).send({ todayTask });
  });

  app.delete("/today-tasks/:taskId", async (request, reply) => {
    const student = await app.requireStudent(request);
    const params = parseParams(request, taskParamsSchema);
    const query = parseQuery(
      request,
      z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }),
    );
    const day = query.day ? new Date(`${query.day}T00:00:00.000Z`) : todayFor(student.timezone);

    await prisma.todayTask.deleteMany({
      where: { studentId: student.id, taskId: params.taskId, day },
    });

    return reply.status(204).send();
  });
}
