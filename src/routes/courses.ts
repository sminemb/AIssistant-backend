import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { prisma } from "../db/prisma.js";
import { HttpError } from "../http/errors.js";
import { parseBody, parseParams } from "../http/validation.js";

const courseParamsSchema = z.object({ courseId: z.string().uuid() });

const createCourseSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

const updateCourseSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
});

async function assertActiveCourseNameAvailable(studentId: string, name: string, exceptCourseId?: string) {
  const existing = await prisma.course.findFirst({
    where: {
      studentId,
      name: { equals: name, mode: "insensitive" },
      archivedAt: null,
      id: exceptCourseId ? { not: exceptCourseId } : undefined,
    },
  });

  if (existing) {
    throw new HttpError(409, "ACTIVE_COURSE_NAME_EXISTS", "Active Course names are unique per Student");
  }
}

export async function coursesRoutes(app: FastifyInstance) {
  app.get("/courses", async (request) => {
    const student = await app.requireStudent(request);
    const courses = await prisma.course.findMany({
      where: { studentId: student.id },
      orderBy: [{ archivedAt: "asc" }, { name: "asc" }],
    });

    return { courses };
  });

  app.post("/courses", async (request, reply) => {
    const student = await app.requireStudent(request);
    const body = parseBody(request, createCourseSchema);

    await assertActiveCourseNameAvailable(student.id, body.name);

    const course = await prisma.course.create({
      data: { studentId: student.id, name: body.name },
    });

    return reply.status(201).send({ course });
  });

  app.patch("/courses/:courseId", async (request) => {
    const student = await app.requireStudent(request);
    const params = parseParams(request, courseParamsSchema);
    const body = parseBody(request, updateCourseSchema);

    const course = await prisma.course.findFirst({
      where: { id: params.courseId, studentId: student.id },
    });

    if (!course) {
      throw new HttpError(404, "COURSE_NOT_FOUND", "Course not found");
    }

    if (body.name && !course.archivedAt) {
      await assertActiveCourseNameAvailable(student.id, body.name, course.id);
    }

    return {
      course: await prisma.course.update({
        where: { id: course.id },
        data: body,
      }),
    };
  });

  app.post("/courses/:courseId/archive", async (request) => {
    const student = await app.requireStudent(request);
    const params = parseParams(request, courseParamsSchema);

    const course = await prisma.course.findFirst({
      where: { id: params.courseId, studentId: student.id },
    });

    if (!course) {
      throw new HttpError(404, "COURSE_NOT_FOUND", "Course not found");
    }

    return {
      course: await prisma.course.update({
        where: { id: course.id },
        data: { archivedAt: course.archivedAt ?? new Date() },
      }),
    };
  });
}
