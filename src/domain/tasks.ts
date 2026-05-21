import type { DueDateKind, PrismaClient } from "@prisma/client";

import { dateOnlyFromKey, studentDayKey } from "./dates.js";
import { HttpError } from "../http/errors.js";

export type DueInput = {
  dueDate?: string | undefined;
  dueAt?: string | undefined;
};

export function parseDueInput(input: DueInput, timezone: string) {
  if (input.dueAt) {
    const dueAt = new Date(input.dueAt);
    if (Number.isNaN(dueAt.getTime())) {
      throw new HttpError(400, "INVALID_DUE_AT", "Due date-time must be a valid ISO date-time");
    }

    return {
      dueDateKind: "DATE_TIME" as DueDateKind,
      dueAt,
      dueDate: dateOnlyFromKey(studentDayKey(dueAt, timezone)),
    };
  }

  if (input.dueDate) {
    return {
      dueDateKind: "DATE_ONLY" as DueDateKind,
      dueAt: null,
      dueDate: dateOnlyFromKey(input.dueDate),
    };
  }

  return {
    dueDateKind: null,
    dueAt: null,
    dueDate: null,
  };
}

export async function assertCourseBelongsToStudent(
  prisma: PrismaClient,
  studentId: string,
  courseId: string | null | undefined,
) {
  if (!courseId) {
    return;
  }

  const course = await prisma.course.findFirst({ where: { id: courseId, studentId } });
  if (!course) {
    throw new HttpError(404, "COURSE_NOT_FOUND", "Course not found");
  }
}

export async function assertTaskTitleAvailable(
  prisma: PrismaClient,
  studentId: string,
  courseId: string | null | undefined,
  title: string,
  exceptTaskId?: string,
) {
  const existing = await prisma.task.findFirst({
    where: {
      studentId,
      courseId: courseId ?? null,
      title: { equals: title, mode: "insensitive" },
      deletedAt: null,
      id: exceptTaskId ? { not: exceptTaskId } : undefined,
    },
  });

  if (existing) {
    throw new HttpError(409, "TASK_TITLE_EXISTS", "Non-deleted Task titles are unique per Student within the same Course");
  }
}
