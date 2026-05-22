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

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function caseInsensitiveEquals(value: string, matcher: unknown) {
  if (typeof matcher === "string") {
    return value === matcher;
  }

  if (matcher && typeof matcher === "object" && "equals" in matcher) {
    return value.toLowerCase() === String(matcher.equals).toLowerCase();
  }

  return false;
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
          if (where.id && typeof where.id === "object" && "not" in where.id && course.id === where.id.not) return false;
          return true;
        }) ?? null
      );
    }),
    findMany: vi.fn(async ({ where }: { where: { studentId: string } }) => {
      return store.courses
        .filter((course) => course.studentId === where.studentId)
        .sort((left, right) => {
          if (!left.archivedAt && right.archivedAt) return -1;
          if (left.archivedAt && !right.archivedAt) return 1;
          return left.name.localeCompare(right.name);
        });
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

      Object.assign(course, data, { updatedAt: new Date() });
      return course;
    }),
  },
  task: {
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      return (
        store.tasks.find((task) => {
          if (where.id && task.id !== where.id) return false;
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
          if (where.deletedAt === null && task.deletedAt !== null) return false;
          if (where.courseId && task.courseId !== where.courseId) return false;
          return true;
        })
        .map((task) => (include?.course ? { ...task, course: store.courses.find((course) => course.id === task.courseId) ?? null } : task));
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
      return include?.course ? { ...task, course: store.courses.find((course) => course.id === task.courseId) ?? null } : task;
    }),
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

describe("Course management HTTP contract", () => {
  beforeEach(() => {
    store.students = [];
    store.sessions = [];
    store.courses = [];
    store.tasks = [];
    vi.clearAllMocks();
  });

  it("lets a Student create and list their Courses", async () => {
    const app = await buildServer(env);
    const auth = await registerStudent(app, "student@example.com");

    const create = await app.inject({
      method: "POST",
      url: "/courses",
      headers: authHeaders(auth),
      payload: { name: "Biology" },
    });

    expect(create.statusCode).toBe(201);
    expect(create.json()).toMatchObject({
      course: {
        studentId: auth.student.id,
        name: "Biology",
        archivedAt: null,
      },
    });

    const list = await app.inject({
      method: "GET",
      url: "/courses",
      headers: { cookie: auth.cookie },
    });

    expect(list.statusCode).toBe(200);
    expect(list.json()).toMatchObject({
      courses: [
        {
          name: "Biology",
          archivedAt: null,
        },
      ],
    });

    await app.close();
  });

  it("lets a Student rename their Course", async () => {
    const app = await buildServer(env);
    const auth = await registerStudent(app, "student@example.com");

    const create = await app.inject({
      method: "POST",
      url: "/courses",
      headers: authHeaders(auth),
      payload: { name: "Biology" },
    });
    const courseId = create.json().course.id;

    const rename = await app.inject({
      method: "PATCH",
      url: `/courses/${courseId}`,
      headers: authHeaders(auth),
      payload: { name: "Advanced Biology" },
    });

    expect(rename.statusCode).toBe(200);
    expect(rename.json()).toMatchObject({
      course: {
        id: courseId,
        name: "Advanced Biology",
        archivedAt: null,
      },
    });

    const list = await app.inject({
      method: "GET",
      url: "/courses",
      headers: { cookie: auth.cookie },
    });

    expect(list.json()).toMatchObject({
      courses: [{ id: courseId, name: "Advanced Biology" }],
    });

    await app.close();
  });

  it("enforces unique active Course names per Student and releases names after archive", async () => {
    const app = await buildServer(env);
    const auth = await registerStudent(app, "student@example.com");

    const biology = await app.inject({
      method: "POST",
      url: "/courses",
      headers: authHeaders(auth),
      payload: { name: "Biology" },
    });

    const duplicate = await app.inject({
      method: "POST",
      url: "/courses",
      headers: authHeaders(auth),
      payload: { name: "biology" },
    });

    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json()).toMatchObject({
      error: { code: "ACTIVE_COURSE_NAME_EXISTS" },
    });

    const archive = await app.inject({
      method: "POST",
      url: `/courses/${biology.json().course.id}/archive`,
      headers: authHeaders(auth),
    });

    expect(archive.statusCode).toBe(200);
    expect(archive.json().course.archivedAt).toEqual(expect.any(String));

    const recreated = await app.inject({
      method: "POST",
      url: "/courses",
      headers: authHeaders(auth),
      payload: { name: "Biology" },
    });

    expect(recreated.statusCode).toBe(201);
    expect(recreated.json()).toMatchObject({
      course: { name: "Biology", archivedAt: null },
    });

    await app.close();
  });

  it("keeps Courses scoped to the owning Student", async () => {
    const app = await buildServer(env);
    const ada = await registerStudent(app, "ada@example.com");
    const grace = await registerStudent(app, "grace@example.com");

    const create = await app.inject({
      method: "POST",
      url: "/courses",
      headers: authHeaders(ada),
      payload: { name: "Biology" },
    });
    const courseId = create.json().course.id;

    const graceList = await app.inject({
      method: "GET",
      url: "/courses",
      headers: { cookie: grace.cookie },
    });

    expect(graceList.statusCode).toBe(200);
    expect(graceList.json()).toEqual({ courses: [] });

    const graceRename = await app.inject({
      method: "PATCH",
      url: `/courses/${courseId}`,
      headers: authHeaders(grace),
      payload: { name: "Chemistry" },
    });

    expect(graceRename.statusCode).toBe(404);
    expect(graceRename.json()).toMatchObject({
      error: { code: "COURSE_NOT_FOUND" },
    });

    await app.close();
  });

  it("keeps archived Courses available for Task assignment without hiding their Tasks", async () => {
    const app = await buildServer(env);
    const auth = await registerStudent(app, "student@example.com");

    const createCourse = await app.inject({
      method: "POST",
      url: "/courses",
      headers: authHeaders(auth),
      payload: { name: "Biology" },
    });
    const courseId = createCourse.json().course.id;

    await app.inject({
      method: "POST",
      url: `/courses/${courseId}/archive`,
      headers: authHeaders(auth),
    });

    const createTask = await app.inject({
      method: "POST",
      url: "/tasks",
      headers: authHeaders(auth),
      payload: {
        courseId,
        title: "Read chapter 4",
      },
    });

    expect(createTask.statusCode).toBe(201);
    expect(createTask.json()).toMatchObject({
      task: {
        title: "Read chapter 4",
        courseId,
        course: {
          id: courseId,
          name: "Biology",
          archivedAt: expect.any(String),
        },
      },
    });

    const tasks = await app.inject({
      method: "GET",
      url: "/tasks",
      headers: { cookie: auth.cookie },
    });

    expect(tasks.statusCode).toBe(200);
    expect(tasks.json()).toMatchObject({
      tasks: [
        {
          title: "Read chapter 4",
          courseId,
          course: {
            id: courseId,
            archivedAt: expect.any(String),
          },
        },
      ],
    });

    await app.close();
  });
});
