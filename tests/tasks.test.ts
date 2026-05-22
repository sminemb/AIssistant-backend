import { createHash, randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

type StudentRecord = {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  timezone: string;
  avatarColor: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type SessionRecord = {
  id: string;
  studentId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
};

type CourseRecord = {
  id: string;
  studentId: string;
  name: string;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type TaskRecord = {
  id: string;
  studentId: string;
  courseId: string | null;
  title: string;
  notes: string | null;
  dueDateKind: string | null;
  dueDate: Date | null;
  dueAt: Date | null;
  completedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const store = vi.hoisted(() => ({
  students: [] as StudentRecord[],
  sessions: [] as SessionRecord[],
  courses: [] as CourseRecord[],
  tasks: [] as TaskRecord[],
}));

function caseInsensitiveEquals(value: string, matcher: unknown) {
  if (typeof matcher === "string") {
    return value === matcher;
  }

  if (matcher && typeof matcher === "object" && "equals" in matcher) {
    return value.toLowerCase() === String(matcher.equals).toLowerCase();
  }

  return false;
}

function includeCourse(task: TaskRecord) {
  return {
    ...task,
    course: store.courses.find((course) => course.id === task.courseId) ?? null,
  };
}

function applyDefined<T extends Record<string, unknown>>(record: T, data: Record<string, unknown>) {
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      record[key as keyof T] = value as T[keyof T];
    }
  }
}

const prismaMock = vi.hoisted(() => ({
  student: {
    findUnique: vi.fn(async ({ where }: { where: { email?: string; id?: string } }) => {
      if (where.email) {
        return store.students.find((student) => student.email === where.email) ?? null;
      }

      if (where.id) {
        return store.students.find((student) => student.id === where.id) ?? null;
      }

      return null;
    }),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const now = new Date();
      const student = {
        id: randomUUID(),
        email: String(data.email),
        passwordHash: String(data.passwordHash),
        displayName: String(data.displayName),
        timezone: String(data.timezone),
        avatarColor: data.avatarColor ? String(data.avatarColor) : null,
        createdAt: now,
        updatedAt: now,
      };

      store.students.push(student);
      return student;
    }),
  },
  session: {
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const session = {
        id: randomUUID(),
        studentId: String(data.studentId),
        tokenHash: String(data.tokenHash),
        expiresAt: data.expiresAt as Date,
        revokedAt: null,
        createdAt: new Date(),
      };

      store.sessions.push(session);
      return session;
    }),
    findUnique: vi.fn(async ({ where }: { where: { tokenHash: string } }) => {
      const session = store.sessions.find((candidate) => candidate.tokenHash === where.tokenHash);
      if (!session) {
        return null;
      }

      return {
        ...session,
        student: store.students.find((student) => student.id === session.studentId) ?? null,
      };
    }),
    updateMany: vi.fn(async () => ({ count: 0 })),
  },
  course: {
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      return (
        store.courses.find((course) => {
          if (where.id && course.id !== where.id) return false;
          if (where.studentId && course.studentId !== where.studentId) return false;
          if (where.archivedAt === null && course.archivedAt !== null) return false;
          if (where.name && !caseInsensitiveEquals(course.name, where.name)) return false;
          return true;
        }) ?? null
      );
    }),
    findMany: vi.fn(async ({ where }: { where: { studentId: string } }) => {
      return store.courses.filter((course) => course.studentId === where.studentId);
    }),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const now = new Date();
      const course = {
        id: randomUUID(),
        studentId: String(data.studentId),
        name: String(data.name),
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      };

      store.courses.push(course);
      return course;
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const course = store.courses.find((candidate) => candidate.id === where.id);
      if (!course) {
        throw new Error("Course not found");
      }

      applyDefined(course, data);
      course.updatedAt = new Date();
      return course;
    }),
  },
  task: {
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      return (
        store.tasks.find((task) => {
          if (where.id) {
            if (typeof where.id === "object" && "not" in where.id && task.id === where.id.not) return false;
            if (typeof where.id === "string" && task.id !== where.id) return false;
          }
          if (where.studentId && task.studentId !== where.studentId) return false;
          if (Object.hasOwn(where, "courseId") && task.courseId !== where.courseId) return false;
          if (where.deletedAt === null && task.deletedAt !== null) return false;
          if (where.title && !caseInsensitiveEquals(task.title, where.title)) return false;
          return true;
        }) ?? null
      );
    }),
    findMany: vi.fn(async ({ where, include }: { where: Record<string, unknown>; include?: { course?: boolean } }) => {
      return store.tasks
        .filter((task) => {
          if (where.studentId && task.studentId !== where.studentId) return false;
          if (Object.hasOwn(where, "deletedAt") && where.deletedAt === null && task.deletedAt !== null) return false;
          if (where.courseId && task.courseId !== where.courseId) return false;
          return true;
        })
        .map((task) => (include?.course ? includeCourse(task) : task));
    }),
    create: vi.fn(async ({ data, include }: { data: Record<string, unknown>; include?: { course?: boolean } }) => {
      const now = new Date();
      const task = {
        id: randomUUID(),
        studentId: String(data.studentId),
        courseId: data.courseId ? String(data.courseId) : null,
        title: String(data.title),
        notes: data.notes ? String(data.notes) : null,
        dueDateKind: data.dueDateKind ? String(data.dueDateKind) : null,
        dueDate: (data.dueDate as Date | null) ?? null,
        dueAt: (data.dueAt as Date | null) ?? null,
        completedAt: null,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      };

      store.tasks.push(task);
      return include?.course ? includeCourse(task) : task;
    }),
    update: vi.fn(async ({ where, data, include }: { where: { id: string }; data: Record<string, unknown>; include?: { course?: boolean } }) => {
      const task = store.tasks.find((candidate) => candidate.id === where.id);
      if (!task) {
        throw new Error("Task not found");
      }

      applyDefined(task, data);
      task.updatedAt = new Date();
      return include?.course ? includeCourse(task) : task;
    }),
  },
  todayTask: {
    findMany: vi.fn(async () => []),
    upsert: vi.fn(),
    deleteMany: vi.fn(async () => ({ count: 0 })),
  },
  $disconnect: vi.fn(async () => undefined),
}));

vi.mock("../src/db/prisma.js", () => ({ prisma: prismaMock }));

const { buildServer } = await import("../src/server.js");

const env = {
  DATABASE_URL: "postgresql://example",
  PORT: 4000,
  NODE_ENV: "test" as const,
  SESSION_SECRET: "test-session-secret-with-enough-length",
  FRONTEND_ORIGINS: "http://localhost:3000",
};

function cookieHeader(setCookies: string[]) {
  return setCookies.map((cookie) => cookie.split(";")[0]).join("; ");
}

function cookieValue(setCookies: string[], name: string) {
  const prefix = `${name}=`;
  const cookie = setCookies.find((candidate) => candidate.startsWith(prefix));
  return cookie?.slice(prefix.length).split(";")[0];
}

async function registerStudent(app: Awaited<ReturnType<typeof buildServer>>, email: string) {
  const response = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: {
      email,
      password: "correct horse battery staple",
      displayName: "Ada Student",
      timezone: "Asia/Manila",
    },
  });
  const setCookieHeader = response.headers["set-cookie"];
  const setCookies = Array.isArray(setCookieHeader) ? setCookieHeader : [String(setCookieHeader)];

  return {
    cookie: cookieHeader(setCookies),
    csrfToken: cookieValue(setCookies, "aissistant_csrf"),
    student: response.json().student as StudentRecord,
  };
}

function authHeaders(auth: Awaited<ReturnType<typeof registerStudent>>) {
  return {
    cookie: auth.cookie,
    "x-csrf-token": auth.csrfToken ?? "",
  };
}

async function createCourse(app: Awaited<ReturnType<typeof buildServer>>, auth: Awaited<ReturnType<typeof registerStudent>>, name = "Biology") {
  const response = await app.inject({
    method: "POST",
    url: "/courses",
    headers: authHeaders(auth),
    payload: { name },
  });

  return response.json().course as CourseRecord;
}

describe("Task lifecycle HTTP contract", () => {
  beforeEach(() => {
    store.students = [];
    store.sessions = [];
    store.courses = [];
    store.tasks = [];
    vi.clearAllMocks();
  });

  it("lets a Student create and list Course-associated and course-less Tasks", async () => {
    const app = await buildServer(env);
    const auth = await registerStudent(app, "student@example.com");
    const course = await createCourse(app, auth);

    const courseTask = await app.inject({
      method: "POST",
      url: "/tasks",
      headers: authHeaders(auth),
      payload: { courseId: course.id, title: "Read chapter 4", notes: "Focus on mitosis" },
    });
    const courseLessTask = await app.inject({
      method: "POST",
      url: "/tasks",
      headers: authHeaders(auth),
      payload: { title: "Plan finals week" },
    });

    expect(courseTask.statusCode).toBe(201);
    expect(courseTask.json()).toMatchObject({
      task: {
        studentId: auth.student.id,
        courseId: course.id,
        title: "Read chapter 4",
        notes: "Focus on mitosis",
        course: { id: course.id, name: "Biology" },
      },
    });
    expect(courseLessTask.statusCode).toBe(201);
    expect(courseLessTask.json()).toMatchObject({
      task: { courseId: null, title: "Plan finals week", course: null },
    });

    const list = await app.inject({
      method: "GET",
      url: "/tasks",
      headers: { cookie: auth.cookie },
    });

    expect(list.statusCode).toBe(200);
    expect(list.json()).toMatchObject({
      tasks: expect.arrayContaining([
        expect.objectContaining({ title: "Read chapter 4", courseId: course.id }),
        expect.objectContaining({ title: "Plan finals week", courseId: null }),
      ]),
    });

    await app.close();
  });

  it("represents date-only and date-time Due Dates", async () => {
    const app = await buildServer(env);
    const auth = await registerStudent(app, "student@example.com");

    const dateOnly = await app.inject({
      method: "POST",
      url: "/tasks",
      headers: authHeaders(auth),
      payload: { title: "Submit lab", dueDate: "2026-05-30" },
    });
    const dateTime = await app.inject({
      method: "POST",
      url: "/tasks",
      headers: authHeaders(auth),
      payload: { title: "Evening review", dueAt: "2026-05-21T18:00:00.000Z" },
    });

    expect(dateOnly.statusCode).toBe(201);
    expect(dateOnly.json()).toMatchObject({
      task: {
        title: "Submit lab",
        dueDateKind: "DATE_ONLY",
        dueDate: "2026-05-30T00:00:00.000Z",
        dueAt: null,
      },
    });
    expect(dateTime.statusCode).toBe(201);
    expect(dateTime.json()).toMatchObject({
      task: {
        title: "Evening review",
        dueDateKind: "DATE_TIME",
        dueDate: "2026-05-22T00:00:00.000Z",
        dueAt: "2026-05-21T18:00:00.000Z",
      },
    });

    await app.close();
  });

  it("lets a Student edit, complete, and reopen a Task", async () => {
    const app = await buildServer(env);
    const auth = await registerStudent(app, "student@example.com");

    const create = await app.inject({
      method: "POST",
      url: "/tasks",
      headers: authHeaders(auth),
      payload: { title: "Read chapter 4", notes: "Initial notes", dueDate: "2026-05-30" },
    });
    const taskId = create.json().task.id;

    const edit = await app.inject({
      method: "PATCH",
      url: `/tasks/${taskId}`,
      headers: authHeaders(auth),
      payload: {
        title: "Read chapter 5",
        notes: "Updated notes",
        dueAt: "2026-05-23T02:00:00.000Z",
      },
    });

    expect(edit.statusCode).toBe(200);
    expect(edit.json()).toMatchObject({
      task: {
        id: taskId,
        title: "Read chapter 5",
        notes: "Updated notes",
        dueDateKind: "DATE_TIME",
        dueDate: "2026-05-23T00:00:00.000Z",
        dueAt: "2026-05-23T02:00:00.000Z",
        completedAt: null,
      },
    });

    const complete = await app.inject({
      method: "POST",
      url: `/tasks/${taskId}/complete`,
      headers: authHeaders(auth),
    });

    expect(complete.statusCode).toBe(200);
    expect(complete.json().task.completedAt).toEqual(expect.any(String));

    const reopen = await app.inject({
      method: "POST",
      url: `/tasks/${taskId}/reopen`,
      headers: authHeaders(auth),
    });

    expect(reopen.statusCode).toBe(200);
    expect(reopen.json()).toMatchObject({
      task: {
        id: taskId,
        completedAt: null,
      },
    });

    await app.close();
  });

  it("enforces title uniqueness within the same Course and allows deleted title reuse", async () => {
    const app = await buildServer(env);
    const auth = await registerStudent(app, "student@example.com");
    const biology = await createCourse(app, auth, "Biology");
    const chemistry = await createCourse(app, auth, "Chemistry");

    const firstBiologyTask = await app.inject({
      method: "POST",
      url: "/tasks",
      headers: authHeaders(auth),
      payload: { courseId: biology.id, title: "Read chapter 4" },
    });
    const duplicateInBiology = await app.inject({
      method: "POST",
      url: "/tasks",
      headers: authHeaders(auth),
      payload: { courseId: biology.id, title: "read chapter 4" },
    });
    const sameTitleInChemistry = await app.inject({
      method: "POST",
      url: "/tasks",
      headers: authHeaders(auth),
      payload: { courseId: chemistry.id, title: "Read chapter 4" },
    });
    const courseLessTask = await app.inject({
      method: "POST",
      url: "/tasks",
      headers: authHeaders(auth),
      payload: { title: "Plan finals week" },
    });
    const duplicateCourseLess = await app.inject({
      method: "POST",
      url: "/tasks",
      headers: authHeaders(auth),
      payload: { title: "plan finals week" },
    });

    expect(firstBiologyTask.statusCode).toBe(201);
    expect(duplicateInBiology.statusCode).toBe(409);
    expect(duplicateInBiology.json()).toMatchObject({
      error: { code: "TASK_TITLE_EXISTS" },
    });
    expect(sameTitleInChemistry.statusCode).toBe(201);
    expect(courseLessTask.statusCode).toBe(201);
    expect(duplicateCourseLess.statusCode).toBe(409);
    expect(duplicateCourseLess.json()).toMatchObject({
      error: { code: "TASK_TITLE_EXISTS" },
    });

    const deleteTask = await app.inject({
      method: "DELETE",
      url: `/tasks/${firstBiologyTask.json().task.id}`,
      headers: authHeaders(auth),
    });
    const reuseDeletedTitle = await app.inject({
      method: "POST",
      url: "/tasks",
      headers: authHeaders(auth),
      payload: { courseId: biology.id, title: "Read chapter 4" },
    });

    expect(deleteTask.statusCode).toBe(204);
    expect(reuseDeletedTitle.statusCode).toBe(201);

    await app.close();
  });

  it("excludes deleted Tasks by default and includes them only when requested", async () => {
    const app = await buildServer(env);
    const auth = await registerStudent(app, "student@example.com");

    const create = await app.inject({
      method: "POST",
      url: "/tasks",
      headers: authHeaders(auth),
      payload: { title: "Archive readings" },
    });
    const taskId = create.json().task.id;

    const deleteTask = await app.inject({
      method: "DELETE",
      url: `/tasks/${taskId}`,
      headers: authHeaders(auth),
    });
    const defaultList = await app.inject({
      method: "GET",
      url: "/tasks",
      headers: { cookie: auth.cookie },
    });
    const deletedList = await app.inject({
      method: "GET",
      url: "/tasks?includeDeleted=true",
      headers: { cookie: auth.cookie },
    });

    expect(deleteTask.statusCode).toBe(204);
    expect(defaultList.json()).toEqual({ tasks: [] });
    expect(deletedList.json()).toMatchObject({
      tasks: [
        {
          id: taskId,
          title: "Archive readings",
          deletedAt: expect.any(String),
        },
      ],
    });

    await app.close();
  });

  it("rejects assigning a Task to another Student's Course", async () => {
    const app = await buildServer(env);
    const ada = await registerStudent(app, "ada@example.com");
    const grace = await registerStudent(app, "grace@example.com");
    const graceCourse = await createCourse(app, grace, "Chemistry");

    const create = await app.inject({
      method: "POST",
      url: "/tasks",
      headers: authHeaders(ada),
      payload: { courseId: graceCourse.id, title: "Read chapter 4" },
    });

    expect(create.statusCode).toBe(404);
    expect(create.json()).toMatchObject({
      error: { code: "COURSE_NOT_FOUND" },
    });

    await app.close();
  });
});
