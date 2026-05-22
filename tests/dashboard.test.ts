import { createHash, randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

type TodayTaskRecord = {
  id: string;
  studentId: string;
  taskId: string;
  day: Date;
  createdAt: Date;
};

type ConversationRecord = {
  id: string;
  studentId: string;
  courseId: string | null;
  title: string | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const store = vi.hoisted(() => ({
  students: [] as StudentRecord[],
  sessions: [] as SessionRecord[],
  courses: [] as CourseRecord[],
  tasks: [] as TaskRecord[],
  todayTasks: [] as TodayTaskRecord[],
  conversations: [] as ConversationRecord[],
}));

function includeCourse(task: TaskRecord) {
  return {
    ...task,
    course: store.courses.find((course) => course.id === task.courseId) ?? null,
  };
}

function includeTask(todayTask: TodayTaskRecord) {
  const task = store.tasks.find((candidate) => candidate.id === todayTask.taskId);
  return {
    ...todayTask,
    task: task ? includeCourse(task) : null,
  };
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
      if (where.email) return store.students.find((student) => student.email === where.email) ?? null;
      if (where.id) return store.students.find((student) => student.id === where.id) ?? null;
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
      if (!session) return null;
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
          if (where.name && !caseInsensitiveEquals(course.name, where.name)) return false;
          if (where.archivedAt === null && course.archivedAt !== null) return false;
          return true;
        }) ?? null
      );
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
          if (where.completedAt === null && task.completedAt !== null) return false;
          if (where.OR && Array.isArray(where.OR)) {
            const matchesDueDate = where.OR.some((condition) => {
              if (!task.dueDate) return false;
              const dueDate = condition.dueDate as Record<string, Date>;
              if (dueDate.lt && !(task.dueDate < dueDate.lt)) return false;
              if (dueDate.gte && !(task.dueDate >= dueDate.gte)) return false;
              if (dueDate.lte && !(task.dueDate <= dueDate.lte)) return false;
              return true;
            });
            if (!matchesDueDate) return false;
          }
          if (where.completedAt && typeof where.completedAt === "object" && "gte" in where.completedAt) {
            if (!task.completedAt || task.completedAt < (where.completedAt.gte as Date)) return false;
          }
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
    update: vi.fn(
      async ({ where, data, include }: { where: { id: string }; data: Record<string, unknown>; include?: { course?: boolean } }) => {
        const task = store.tasks.find((candidate) => candidate.id === where.id);
        if (!task) {
          throw new Error("Task not found");
        }

        applyDefined(task, data);
        task.updatedAt = new Date();
        return include?.course ? includeCourse(task) : task;
      },
    ),
  },
  todayTask: {
    findMany: vi.fn(async ({ where, include }: { where: Record<string, unknown>; include?: { task?: unknown } }) => {
      return store.todayTasks
        .filter((todayTask) => {
          if (where.studentId && todayTask.studentId !== where.studentId) return false;
          if (where.day instanceof Date && todayTask.day.getTime() !== where.day.getTime()) return false;
          if (where.task && typeof where.task === "object" && "deletedAt" in where.task) {
            const task = store.tasks.find((candidate) => candidate.id === todayTask.taskId);
            if (!task || task.deletedAt !== where.task.deletedAt) return false;
          }
          return true;
        })
        .map((todayTask) => (include?.task ? includeTask(todayTask) : todayTask));
    }),
    upsert: vi.fn(
      async ({
        where,
        create,
        include,
      }: {
        where: { studentId_taskId_day: { studentId: string; taskId: string; day: Date } };
        create: Record<string, unknown>;
        include?: { task?: unknown };
      }) => {
        const unique = where.studentId_taskId_day;
        let todayTask = store.todayTasks.find(
          (candidate) =>
            candidate.studentId === unique.studentId &&
            candidate.taskId === unique.taskId &&
            candidate.day.getTime() === unique.day.getTime(),
        );

        if (!todayTask) {
          todayTask = {
            id: randomUUID(),
            studentId: String(create.studentId),
            taskId: String(create.taskId),
            day: create.day as Date,
            createdAt: new Date(),
          };
          store.todayTasks.push(todayTask);
        }

        return include?.task ? includeTask(todayTask) : todayTask;
      },
    ),
    deleteMany: vi.fn(async () => ({ count: 0 })),
  },
  conversation: {
    findFirst: vi.fn(async ({ where, include, orderBy }: { where: Record<string, unknown>; include?: { messages?: unknown }; orderBy?: Record<string, string> }) => {
      const conversations = store.conversations
        .filter((conversation) => {
          if (where.id && conversation.id !== where.id) return false;
          if (where.studentId && conversation.studentId !== where.studentId) return false;
          if (where.deletedAt === null && conversation.deletedAt !== null) return false;
          return true;
        })
        .sort((left, right) => {
          if (orderBy?.updatedAt === "desc") return right.updatedAt.getTime() - left.updatedAt.getTime();
          return 0;
        });
      const conversation = conversations[0] ?? null;
      if (!conversation) return null;
      return include?.messages ? { ...conversation, messages: [] } : conversation;
    }),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const now = new Date();
      const conversation = {
        id: randomUUID(),
        studentId: String(data.studentId),
        courseId: data.courseId ? String(data.courseId) : null,
        title: data.title ? String(data.title) : null,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      store.conversations.push(conversation);
      return conversation;
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const conversation = store.conversations.find((candidate) => candidate.id === where.id);
      if (!conversation) {
        throw new Error("Conversation not found");
      }

      applyDefined(conversation, data);
      return conversation;
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

async function createCourse(app: Awaited<ReturnType<typeof buildServer>>, auth: Awaited<ReturnType<typeof registerStudent>>, name: string) {
  const response = await app.inject({
    method: "POST",
    url: "/courses",
    headers: authHeaders(auth),
    payload: { name },
  });

  return response.json().course as CourseRecord;
}

describe("Dashboard Summary HTTP contract", () => {
  beforeEach(() => {
    store.students = [];
    store.sessions = [];
    store.courses = [];
    store.tasks = [];
    store.todayTasks = [];
    store.conversations = [];
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("includes Due Soon Tasks that are overdue or due within the next 14 Student Days", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-05-21T16:30:00.000Z"));

    const app = await buildServer(env);
    const auth = await registerStudent(app, "student@example.com");

    await app.inject({
      method: "POST",
      url: "/tasks",
      headers: authHeaders(auth),
      payload: { title: "Overdue reading", dueDate: "2026-05-20" },
    });
    await app.inject({
      method: "POST",
      url: "/tasks",
      headers: authHeaders(auth),
      payload: { title: "Due soon essay", dueDate: "2026-06-05" },
    });
    await app.inject({
      method: "POST",
      url: "/tasks",
      headers: authHeaders(auth),
      payload: { title: "Later project", dueDate: "2026-06-06" },
    });

    const summary = await app.inject({
      method: "GET",
      url: "/dashboard/summary",
      headers: { cookie: auth.cookie },
    });

    expect(summary.statusCode).toBe(200);
    expect(summary.json()).toMatchObject({
      studentDay: "2026-05-22",
      dueSoonThrough: "2026-06-05",
      dueSoonTasks: [
        { title: "Overdue reading", dueDate: "2026-05-20T00:00:00.000Z" },
        { title: "Due soon essay", dueDate: "2026-06-05T00:00:00.000Z" },
      ],
    });
    expect(summary.json().dueSoonTasks).toHaveLength(2);

    await app.close();
  });

  it("includes Today's Tasks for the current Student Day", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-05-21T16:30:00.000Z"));

    const app = await buildServer(env);
    const auth = await registerStudent(app, "student@example.com");

    const todayTask = await app.inject({
      method: "POST",
      url: "/tasks",
      headers: authHeaders(auth),
      payload: { title: "Focus review" },
    });
    const yesterdayTask = await app.inject({
      method: "POST",
      url: "/tasks",
      headers: authHeaders(auth),
      payload: { title: "Yesterday focus" },
    });

    await app.inject({
      method: "POST",
      url: "/today-tasks",
      headers: authHeaders(auth),
      payload: { taskId: todayTask.json().task.id },
    });
    await app.inject({
      method: "POST",
      url: "/today-tasks",
      headers: authHeaders(auth),
      payload: { taskId: yesterdayTask.json().task.id, day: "2026-05-21" },
    });

    const summary = await app.inject({
      method: "GET",
      url: "/dashboard/summary",
      headers: { cookie: auth.cookie },
    });

    expect(summary.statusCode).toBe(200);
    expect(summary.json()).toMatchObject({
      todaysTasks: [{ title: "Focus review" }],
    });
    expect(summary.json().todaysTasks).toHaveLength(1);

    await app.close();
  });

  it("includes last 7 Student Days Progress grouped by Course", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-05-21T16:30:00.000Z"));

    const app = await buildServer(env);
    const auth = await registerStudent(app, "student@example.com");
    const biology = await createCourse(app, auth, "Biology");
    const chemistry = await createCourse(app, auth, "Chemistry");

    const biologyTask = await app.inject({
      method: "POST",
      url: "/tasks",
      headers: authHeaders(auth),
      payload: { courseId: biology.id, title: "Finish biology lab" },
    });
    const chemistryTask = await app.inject({
      method: "POST",
      url: "/tasks",
      headers: authHeaders(auth),
      payload: { courseId: chemistry.id, title: "Finish chemistry set" },
    });
    const olderTask = await app.inject({
      method: "POST",
      url: "/tasks",
      headers: authHeaders(auth),
      payload: { title: "Old completed task" },
    });

    vi.setSystemTime(new Date("2026-05-19T04:00:00.000Z"));
    await app.inject({
      method: "POST",
      url: `/tasks/${biologyTask.json().task.id}/complete`,
      headers: authHeaders(auth),
    });
    vi.setSystemTime(new Date("2026-05-22T02:00:00.000Z"));
    await app.inject({
      method: "POST",
      url: `/tasks/${chemistryTask.json().task.id}/complete`,
      headers: authHeaders(auth),
    });
    vi.setSystemTime(new Date("2026-05-14T04:00:00.000Z"));
    await app.inject({
      method: "POST",
      url: `/tasks/${olderTask.json().task.id}/complete`,
      headers: authHeaders(auth),
    });

    vi.setSystemTime(new Date("2026-05-21T16:30:00.000Z"));
    const summary = await app.inject({
      method: "GET",
      url: "/dashboard/summary",
      headers: { cookie: auth.cookie },
    });

    expect(summary.statusCode).toBe(200);
    expect(summary.json().progress).toHaveLength(7);
    expect(summary.json().progress).toMatchObject([
      { day: "2026-05-16", completedTasks: 0, byCourse: [] },
      { day: "2026-05-17", completedTasks: 0, byCourse: [] },
      { day: "2026-05-18", completedTasks: 0, byCourse: [] },
      {
        day: "2026-05-19",
        completedTasks: 1,
        byCourse: [{ courseId: biology.id, courseName: "Biology", completedTasks: 1 }],
      },
      { day: "2026-05-20", completedTasks: 0, byCourse: [] },
      { day: "2026-05-21", completedTasks: 0, byCourse: [] },
      {
        day: "2026-05-22",
        completedTasks: 1,
        byCourse: [{ courseId: chemistry.id, courseName: "Chemistry", completedTasks: 1 }],
      },
    ]);

    await app.close();
  });

  it("excludes deleted Tasks from Dashboard Summary and Progress", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-05-21T16:30:00.000Z"));

    const app = await buildServer(env);
    const auth = await registerStudent(app, "student@example.com");

    const dueSoon = await app.inject({
      method: "POST",
      url: "/tasks",
      headers: authHeaders(auth),
      payload: { title: "Deleted due soon", dueDate: "2026-05-23" },
    });
    const today = await app.inject({
      method: "POST",
      url: "/tasks",
      headers: authHeaders(auth),
      payload: { title: "Deleted today focus" },
    });
    const completed = await app.inject({
      method: "POST",
      url: "/tasks",
      headers: authHeaders(auth),
      payload: { title: "Deleted completed task" },
    });

    await app.inject({
      method: "POST",
      url: "/today-tasks",
      headers: authHeaders(auth),
      payload: { taskId: today.json().task.id },
    });
    await app.inject({
      method: "POST",
      url: `/tasks/${completed.json().task.id}/complete`,
      headers: authHeaders(auth),
    });

    for (const taskId of [dueSoon.json().task.id, today.json().task.id, completed.json().task.id]) {
      await app.inject({
        method: "DELETE",
        url: `/tasks/${taskId}`,
        headers: authHeaders(auth),
      });
    }

    const summary = await app.inject({
      method: "GET",
      url: "/dashboard/summary",
      headers: { cookie: auth.cookie },
    });

    expect(summary.statusCode).toBe(200);
    expect(summary.json().dueSoonTasks).toEqual([]);
    expect(summary.json().todaysTasks).toEqual([]);
    expect(summary.json().progress).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ day: "2026-05-22", completedTasks: 0, byCourse: [] }),
      ]),
    );

    await app.close();
  });

  it("includes the latest non-deleted Conversation summary when available", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });

    const app = await buildServer(env);
    const auth = await registerStudent(app, "student@example.com");

    vi.setSystemTime(new Date("2026-05-20T00:00:00.000Z"));
    await app.inject({
      method: "POST",
      url: "/conversations",
      headers: authHeaders(auth),
      payload: { title: "Older study chat" },
    });

    vi.setSystemTime(new Date("2026-05-21T00:00:00.000Z"));
    const deleted = await app.inject({
      method: "POST",
      url: "/conversations",
      headers: authHeaders(auth),
      payload: { title: "Deleted latest chat" },
    });

    vi.setSystemTime(new Date("2026-05-20T12:00:00.000Z"));
    const latestKept = await app.inject({
      method: "POST",
      url: "/conversations",
      headers: authHeaders(auth),
      payload: { title: "Latest kept chat" },
    });

    await app.inject({
      method: "DELETE",
      url: `/conversations/${deleted.json().conversation.id}`,
      headers: authHeaders(auth),
    });

    const summary = await app.inject({
      method: "GET",
      url: "/dashboard/summary",
      headers: { cookie: auth.cookie },
    });

    expect(summary.statusCode).toBe(200);
    expect(summary.json()).toMatchObject({
      latestConversation: {
        id: latestKept.json().conversation.id,
        title: "Latest kept chat",
        deletedAt: null,
        messages: [],
      },
    });

    await app.close();
  });
});
