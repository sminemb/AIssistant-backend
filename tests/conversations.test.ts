import { randomUUID } from "node:crypto";

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

type ConversationRecord = {
  id: string;
  studentId: string;
  courseId: string | null;
  title: string | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type MessageRecord = {
  id: string;
  studentId: string;
  conversationId: string;
  author: "STUDENT" | "ASSISTANT";
  content: string;
  createdAt: Date;
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

type SuggestedTaskRecord = {
  id: string;
  studentId: string;
  conversationId: string;
  courseId: string | null;
  createdTaskId: string | null;
  title: string;
  notes: string | null;
  dueDateKind: string | null;
  dueDate: Date | null;
  dueAt: Date | null;
  state: "PENDING" | "CONFIRMED" | "DISMISSED";
  createdAt: Date;
  updatedAt: Date;
};

const store = vi.hoisted(() => ({
  students: [] as StudentRecord[],
  sessions: [] as SessionRecord[],
  courses: [] as CourseRecord[],
  conversations: [] as ConversationRecord[],
  messages: [] as MessageRecord[],
  tasks: [] as TaskRecord[],
  suggestedTasks: [] as SuggestedTaskRecord[],
}));

function caseInsensitiveEquals(value: string, matcher: unknown) {
  if (typeof matcher === "string") return value === matcher;
  if (matcher && typeof matcher === "object" && "equals" in matcher) {
    return value.toLowerCase() === String(matcher.equals).toLowerCase();
  }
  return false;
}

function includeCourse(conversation: ConversationRecord) {
  return {
    ...conversation,
    course: store.courses.find((course) => course.id === conversation.courseId) ?? null,
  };
}

function includeTaskCourse(task: TaskRecord) {
  return {
    ...task,
    course: store.courses.find((course) => course.id === task.courseId) ?? null,
  };
}

function includeSuggestedTaskCourse(suggestedTask: SuggestedTaskRecord) {
  return {
    ...suggestedTask,
    course: store.courses.find((course) => course.id === suggestedTask.courseId) ?? null,
    createdTask: store.tasks.find((task) => task.id === suggestedTask.createdTaskId) ?? null,
  };
}

function includeConversationRelations(
  conversation: ConversationRecord,
  include?: { course?: boolean; messages?: { orderBy?: { createdAt: "asc" | "desc" }; take?: number }; suggestedTasks?: unknown },
) {
  let messages = store.messages.filter((message) => message.conversationId === conversation.id);
  if (include?.messages?.orderBy?.createdAt === "asc") {
    messages = [...messages].sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
  }
  if (include?.messages?.orderBy?.createdAt === "desc") {
    messages = [...messages].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
  }
  if (include?.messages?.take !== undefined) {
    messages = messages.slice(0, include.messages.take);
  }
  const suggestedTasks = store.suggestedTasks
    .filter((suggestedTask) => suggestedTask.conversationId === conversation.id)
    .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
    .map((suggestedTask) => includeSuggestedTaskCourse(suggestedTask));

  return {
    ...conversation,
    ...(include?.course ? { course: store.courses.find((course) => course.id === conversation.courseId) ?? null } : {}),
    ...(include?.messages ? { messages } : {}),
    ...(include?.suggestedTasks ? { suggestedTasks } : {}),
  };
}

function applyDefined<T extends Record<string, unknown>>(record: T, data: Record<string, unknown>) {
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) record[key as keyof T] = value as T[keyof T];
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
    findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      return store.courses.filter((course) => {
        if (where.studentId && course.studentId !== where.studentId) return false;
        if (where.id && typeof where.id === "object" && "in" in where.id && !(where.id.in as string[]).includes(course.id)) return false;
        return true;
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
  },
  conversation: {
    findMany: vi.fn(
      async ({ where, include }: { where: Record<string, unknown>; include?: Parameters<typeof includeConversationRelations>[1] }) => {
        return store.conversations
          .filter((conversation) => {
            if (where.studentId && conversation.studentId !== where.studentId) return false;
            if (where.deletedAt === null && conversation.deletedAt !== null) return false;
            return true;
          })
          .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())
          .map((conversation) => includeConversationRelations(conversation, include));
      },
    ),
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      return (
        store.conversations.find((conversation) => {
          if (where.id && conversation.id !== where.id) return false;
          if (where.studentId && conversation.studentId !== where.studentId) return false;
          if (where.deletedAt === null && conversation.deletedAt !== null) return false;
          return true;
        }) ?? null
      );
    }),
    findFirstOrThrow: vi.fn(
      async ({ where, include }: { where: Record<string, unknown>; include?: Parameters<typeof includeConversationRelations>[1] }) => {
        const conversation = store.conversations.find((candidate) => {
          if (where.id && candidate.id !== where.id) return false;
          if (where.studentId && candidate.studentId !== where.studentId) return false;
          return true;
        });
        if (!conversation) throw new Error("Conversation not found");
        return includeConversationRelations(conversation, include);
      },
    ),
    create: vi.fn(async ({ data, include }: { data: Record<string, unknown>; include?: { course?: boolean } }) => {
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
      return include?.course ? includeCourse(conversation) : conversation;
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const conversation = store.conversations.find((candidate) => candidate.id === where.id);
      if (!conversation) throw new Error("Conversation not found");
      applyDefined(conversation, data);
      return conversation;
    }),
  },
  message: {
    findMany: vi.fn(
      async ({ where, orderBy, take }: { where: Record<string, unknown>; orderBy?: { createdAt: "asc" | "desc" }; take?: number }) => {
        let messages = store.messages.filter((message) => {
          if (where.studentId && message.studentId !== where.studentId) return false;
          if (where.conversationId && message.conversationId !== where.conversationId) return false;
          return true;
        });
        if (orderBy?.createdAt === "asc") {
          messages = [...messages].sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
        }
        if (orderBy?.createdAt === "desc") {
          messages = [...messages].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
        }
        return take === undefined ? messages : messages.slice(0, take);
      },
    ),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const message = {
        id: randomUUID(),
        studentId: String(data.studentId),
        conversationId: String(data.conversationId),
        author: data.author as "STUDENT" | "ASSISTANT",
        content: String(data.content),
        createdAt: new Date(),
      };
      store.messages.push(message);
      return message;
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
          return true;
        })
        .map((task) => (include?.course ? includeTaskCourse(task) : task));
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
      return include?.course ? includeTaskCourse(task) : task;
    }),
  },
  todayTask: {
    findMany: vi.fn(async () => []),
  },
  suggestedTask: {
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      return (
        store.suggestedTasks.find((suggestedTask) => {
          if (where.id && suggestedTask.id !== where.id) return false;
          if (where.studentId && suggestedTask.studentId !== where.studentId) return false;
          return true;
        }) ?? null
      );
    }),
    create: vi.fn(async ({ data, include }: { data: Record<string, unknown>; include?: { course?: boolean; createdTask?: boolean } }) => {
      const now = new Date();
      const suggestedTask = {
        id: randomUUID(),
        studentId: String(data.studentId),
        conversationId: String(data.conversationId),
        courseId: data.courseId ? String(data.courseId) : null,
        createdTaskId: null,
        title: String(data.title),
        notes: data.notes ? String(data.notes) : null,
        dueDateKind: data.dueDateKind ? String(data.dueDateKind) : null,
        dueDate: (data.dueDate as Date | null) ?? null,
        dueAt: (data.dueAt as Date | null) ?? null,
        state: "PENDING" as const,
        createdAt: now,
        updatedAt: now,
      };
      store.suggestedTasks.push(suggestedTask);
      return include?.course || include?.createdTask ? includeSuggestedTaskCourse(suggestedTask) : suggestedTask;
    }),
    update: vi.fn(
      async ({
        where,
        data,
        include,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
        include?: { course?: boolean; createdTask?: boolean };
      }) => {
        const suggestedTask = store.suggestedTasks.find((candidate) => candidate.id === where.id);
        if (!suggestedTask) throw new Error("Suggested Task not found");
        applyDefined(suggestedTask, data);
        suggestedTask.updatedAt = new Date();
        return include?.course || include?.createdTask ? includeSuggestedTaskCourse(suggestedTask) : suggestedTask;
      },
    ),
  },
  $transaction: vi.fn(async (callback: (tx: typeof prismaMock) => Promise<unknown>) => callback(prismaMock)),
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

describe("Conversation and Message lifecycle HTTP contract", () => {
  beforeEach(() => {
    store.students = [];
    store.sessions = [];
    store.courses = [];
    store.conversations = [];
    store.messages = [];
    store.tasks = [];
    store.suggestedTasks = [];
    vi.clearAllMocks();
  });

  it("lets a Student create, list, and view general and Course-associated Conversations", async () => {
    const app = await buildServer(env);
    const auth = await registerStudent(app, "student@example.com");
    const course = await createCourse(app, auth, "Biology");

    const general = await app.inject({
      method: "POST",
      url: "/conversations",
      headers: authHeaders(auth),
      payload: { title: "General study help" },
    });
    const courseConversation = await app.inject({
      method: "POST",
      url: "/conversations",
      headers: authHeaders(auth),
      payload: { title: "Biology help", courseId: course.id },
    });

    expect(general.statusCode).toBe(201);
    expect(general.json()).toMatchObject({
      conversation: {
        studentId: auth.student.id,
        courseId: null,
        title: "General study help",
        course: null,
      },
    });
    expect(courseConversation.statusCode).toBe(201);
    expect(courseConversation.json()).toMatchObject({
      conversation: {
        studentId: auth.student.id,
        courseId: course.id,
        title: "Biology help",
        course: { id: course.id, name: "Biology" },
      },
    });

    const list = await app.inject({
      method: "GET",
      url: "/conversations",
      headers: { cookie: auth.cookie },
    });
    const view = await app.inject({
      method: "GET",
      url: `/conversations/${courseConversation.json().conversation.id}`,
      headers: { cookie: auth.cookie },
    });

    expect(list.statusCode).toBe(200);
    expect(list.json().conversations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: "General study help", courseId: null }),
        expect.objectContaining({ title: "Biology help", course: expect.objectContaining({ id: course.id }) }),
      ]),
    );
    expect(view.statusCode).toBe(200);
    expect(view.json()).toMatchObject({
      conversation: {
        id: courseConversation.json().conversation.id,
        title: "Biology help",
        course: { id: course.id, name: "Biology" },
        messages: [],
        suggestedTasks: [],
      },
    });

    await app.close();
  });

  it("keeps Conversations and Conversation Courses scoped to the owning Student", async () => {
    const app = await buildServer(env);
    const ada = await registerStudent(app, "ada@example.com");
    const grace = await registerStudent(app, "grace@example.com");
    const adaCourse = await createCourse(app, ada, "Biology");

    const adaConversation = await app.inject({
      method: "POST",
      url: "/conversations",
      headers: authHeaders(ada),
      payload: { title: "Ada private chat" },
    });

    const graceList = await app.inject({
      method: "GET",
      url: "/conversations",
      headers: { cookie: grace.cookie },
    });
    const graceView = await app.inject({
      method: "GET",
      url: `/conversations/${adaConversation.json().conversation.id}`,
      headers: { cookie: grace.cookie },
    });
    const graceWithAdaCourse = await app.inject({
      method: "POST",
      url: "/conversations",
      headers: authHeaders(grace),
      payload: { title: "Wrong Course", courseId: adaCourse.id },
    });

    expect(graceList.statusCode).toBe(200);
    expect(graceList.json()).toEqual({ conversations: [] });
    expect(graceView.statusCode).toBe(404);
    expect(graceView.json()).toMatchObject({
      error: { code: "CONVERSATION_NOT_FOUND" },
    });
    expect(graceWithAdaCourse.statusCode).toBe(404);
    expect(graceWithAdaCourse.json()).toMatchObject({
      error: { code: "COURSE_NOT_FOUND" },
    });

    await app.close();
  });

  it("lets a Student create Messages in a Conversation and view immutable Message history", async () => {
    const app = await buildServer(env);
    const auth = await registerStudent(app, "student@example.com");

    const conversation = await app.inject({
      method: "POST",
      url: "/conversations",
      headers: authHeaders(auth),
      payload: { title: "Explain biology" },
    });
    const conversationId = conversation.json().conversation.id;

    const createMessage = await app.inject({
      method: "POST",
      url: `/conversations/${conversationId}/messages`,
      headers: authHeaders(auth),
      payload: { content: "Explain photosynthesis" },
    });
    const view = await app.inject({
      method: "GET",
      url: `/conversations/${conversationId}`,
      headers: { cookie: auth.cookie },
    });

    expect(createMessage.statusCode).toBe(201);
    expect(createMessage.json()).toMatchObject({
      studentMessage: {
        studentId: auth.student.id,
        conversationId,
        author: "STUDENT",
        content: "Explain photosynthesis",
      },
      assistantMessage: {
        studentId: auth.student.id,
        conversationId,
        author: "ASSISTANT",
        content: "Share the topic or Course, and I will break it into simple steps with an example.",
      },
      suggestedTasks: [],
    });
    expect(view.statusCode).toBe(200);
    expect(view.json()).toMatchObject({
      conversation: {
        id: conversationId,
        messages: [
          { author: "STUDENT", content: "Explain photosynthesis" },
          {
            author: "ASSISTANT",
            content: "Share the topic or Course, and I will break it into simple steps with an example.",
          },
        ],
      },
    });

    const studentMessageId = createMessage.json().studentMessage.id;
    const editMessage = await app.inject({
      method: "PATCH",
      url: `/messages/${studentMessageId}`,
      headers: authHeaders(auth),
      payload: { content: "Edited content" },
    });
    const deleteMessage = await app.inject({
      method: "DELETE",
      url: `/messages/${studentMessageId}`,
      headers: authHeaders(auth),
    });

    expect(editMessage.statusCode).toBe(404);
    expect(deleteMessage.statusCode).toBe(404);

    await app.close();
  });

  it("excludes deleted Conversations from list, read, and new Message behavior", async () => {
    const app = await buildServer(env);
    const auth = await registerStudent(app, "student@example.com");

    const conversation = await app.inject({
      method: "POST",
      url: "/conversations",
      headers: authHeaders(auth),
      payload: { title: "Temporary chat" },
    });
    const conversationId = conversation.json().conversation.id;

    const deleteConversation = await app.inject({
      method: "DELETE",
      url: `/conversations/${conversationId}`,
      headers: authHeaders(auth),
    });
    const list = await app.inject({
      method: "GET",
      url: "/conversations",
      headers: { cookie: auth.cookie },
    });
    const view = await app.inject({
      method: "GET",
      url: `/conversations/${conversationId}`,
      headers: { cookie: auth.cookie },
    });
    const createMessage = await app.inject({
      method: "POST",
      url: `/conversations/${conversationId}/messages`,
      headers: authHeaders(auth),
      payload: { content: "Can this still be used?" },
    });

    expect(deleteConversation.statusCode).toBe(204);
    expect(list.json()).toEqual({ conversations: [] });
    expect(view.statusCode).toBe(404);
    expect(view.json()).toMatchObject({
      error: { code: "CONVERSATION_NOT_FOUND" },
    });
    expect(createMessage.statusCode).toBe(404);
    expect(createMessage.json()).toMatchObject({
      error: { code: "CONVERSATION_NOT_FOUND" },
    });

    await app.close();
  });

  it("returns Student Message, Assistant Message, and Suggested Tasks synchronously for study plans", async () => {
    const app = await buildServer(env);
    const auth = await registerStudent(app, "student@example.com");
    const biology = await createCourse(app, auth, "Biology");

    await app.inject({
      method: "POST",
      url: "/tasks",
      headers: authHeaders(auth),
      payload: { courseId: biology.id, title: "Read chapter 8", dueDate: "2026-05-30" },
    });
    const conversation = await app.inject({
      method: "POST",
      url: "/conversations",
      headers: authHeaders(auth),
      payload: { title: "Planning", courseId: biology.id },
    });

    const reply = await app.inject({
      method: "POST",
      url: `/conversations/${conversation.json().conversation.id}/messages`,
      headers: authHeaders(auth),
      payload: { content: "Please make a study plan" },
    });

    expect(reply.statusCode).toBe(201);
    expect(reply.json()).toMatchObject({
      studentMessage: {
        author: "STUDENT",
        content: "Please make a study plan",
      },
      assistantMessage: {
        author: "ASSISTANT",
        content: "I found a few priorities and drafted Suggested Tasks for your study plan. Confirm the ones you want to add.",
      },
      suggestedTasks: [
        {
          title: "Work on Read chapter 8",
          notes: "Suggested by the AI Study Assistant from your due soon tasks.",
          courseId: biology.id,
          state: "PENDING",
          course: { id: biology.id, name: "Biology" },
        },
      ],
    });

    const view = await app.inject({
      method: "GET",
      url: `/conversations/${conversation.json().conversation.id}`,
      headers: { cookie: auth.cookie },
    });

    expect(view.statusCode).toBe(200);
    expect(view.json().conversation.suggestedTasks).toEqual([
      expect.objectContaining({
        id: reply.json().suggestedTasks[0].id,
        title: "Work on Read chapter 8",
        state: "PENDING",
        createdTaskId: null,
        createdTask: null,
      }),
    ]);

    await app.close();
  });

  it("lets a Student confirm a pending Suggested Task into a real Task", async () => {
    const app = await buildServer(env);
    const auth = await registerStudent(app, "student@example.com");
    const biology = await createCourse(app, auth, "Biology");

    await app.inject({
      method: "POST",
      url: "/tasks",
      headers: authHeaders(auth),
      payload: { courseId: biology.id, title: "Read chapter 8", dueDate: "2026-05-30" },
    });
    const conversation = await app.inject({
      method: "POST",
      url: "/conversations",
      headers: authHeaders(auth),
      payload: { title: "Planning", courseId: biology.id },
    });
    const reply = await app.inject({
      method: "POST",
      url: `/conversations/${conversation.json().conversation.id}/messages`,
      headers: authHeaders(auth),
      payload: { content: "Please make a study plan" },
    });

    const confirm = await app.inject({
      method: "POST",
      url: `/suggested-tasks/${reply.json().suggestedTasks[0].id}/confirm`,
      headers: authHeaders(auth),
    });

    expect(confirm.statusCode).toBe(200);
    expect(confirm.json()).toMatchObject({
      task: {
        studentId: auth.student.id,
        courseId: biology.id,
        title: "Work on Read chapter 8",
        notes: "Suggested by the AI Study Assistant from your due soon tasks.",
        course: { id: biology.id, name: "Biology" },
      },
      suggestedTask: {
        id: reply.json().suggestedTasks[0].id,
        state: "CONFIRMED",
        title: "Work on Read chapter 8",
      },
    });
    expect(confirm.json().suggestedTask.createdTaskId).toBe(confirm.json().task.id);
    expect(confirm.json().suggestedTask.createdTask).toMatchObject({
      id: confirm.json().task.id,
      title: "Work on Read chapter 8",
    });

    const view = await app.inject({
      method: "GET",
      url: `/conversations/${conversation.json().conversation.id}`,
      headers: { cookie: auth.cookie },
    });

    expect(view.json().conversation.suggestedTasks).toEqual([
      expect.objectContaining({
        id: reply.json().suggestedTasks[0].id,
        state: "CONFIRMED",
        createdTaskId: confirm.json().task.id,
        createdTask: expect.objectContaining({ id: confirm.json().task.id }),
      }),
    ]);

    await app.close();
  });

  it("lets a Student dismiss a pending Suggested Task without creating a Task", async () => {
    const app = await buildServer(env);
    const auth = await registerStudent(app, "student@example.com");
    const biology = await createCourse(app, auth, "Biology");

    await app.inject({
      method: "POST",
      url: "/tasks",
      headers: authHeaders(auth),
      payload: { courseId: biology.id, title: "Read chapter 8", dueDate: "2026-05-30" },
    });
    const conversation = await app.inject({
      method: "POST",
      url: "/conversations",
      headers: authHeaders(auth),
      payload: { title: "Planning", courseId: biology.id },
    });
    const reply = await app.inject({
      method: "POST",
      url: `/conversations/${conversation.json().conversation.id}/messages`,
      headers: authHeaders(auth),
      payload: { content: "Please make a study plan" },
    });

    const dismiss = await app.inject({
      method: "POST",
      url: `/suggested-tasks/${reply.json().suggestedTasks[0].id}/dismiss`,
      headers: authHeaders(auth),
    });

    expect(dismiss.statusCode).toBe(200);
    expect(dismiss.json()).toMatchObject({
      suggestedTask: {
        id: reply.json().suggestedTasks[0].id,
        state: "DISMISSED",
        createdTaskId: null,
        title: "Work on Read chapter 8",
      },
    });

    const view = await app.inject({
      method: "GET",
      url: `/conversations/${conversation.json().conversation.id}`,
      headers: { cookie: auth.cookie },
    });

    expect(view.json().conversation.suggestedTasks).toEqual([
      expect.objectContaining({
        id: reply.json().suggestedTasks[0].id,
        state: "DISMISSED",
        createdTaskId: null,
        createdTask: null,
      }),
    ]);
    expect(store.tasks).toHaveLength(1);

    await app.close();
  });

  it("rejects confirmation when the Suggested Task would duplicate a non-deleted Task title", async () => {
    const app = await buildServer(env);
    const auth = await registerStudent(app, "student@example.com");
    const biology = await createCourse(app, auth, "Biology");

    await app.inject({
      method: "POST",
      url: "/tasks",
      headers: authHeaders(auth),
      payload: { courseId: biology.id, title: "Read chapter 8", dueDate: "2026-05-30" },
    });
    const conversation = await app.inject({
      method: "POST",
      url: "/conversations",
      headers: authHeaders(auth),
      payload: { title: "Planning", courseId: biology.id },
    });
    const reply = await app.inject({
      method: "POST",
      url: `/conversations/${conversation.json().conversation.id}/messages`,
      headers: authHeaders(auth),
      payload: { content: "Please make a study plan" },
    });
    await app.inject({
      method: "POST",
      url: "/tasks",
      headers: authHeaders(auth),
      payload: { courseId: biology.id, title: "Work on Read chapter 8" },
    });

    const confirm = await app.inject({
      method: "POST",
      url: `/suggested-tasks/${reply.json().suggestedTasks[0].id}/confirm`,
      headers: authHeaders(auth),
    });

    expect(confirm.statusCode).toBe(409);
    expect(confirm.json()).toMatchObject({
      error: { code: "TASK_TITLE_EXISTS" },
    });
    expect(store.suggestedTasks[0]).toMatchObject({
      id: reply.json().suggestedTasks[0].id,
      state: "PENDING",
      createdTaskId: null,
    });
    expect(store.tasks.filter((task) => task.title === "Work on Read chapter 8")).toHaveLength(1);

    await app.close();
  });

  it("rejects repeated confirmation or dismissal of non-pending Suggested Tasks", async () => {
    const app = await buildServer(env);
    const auth = await registerStudent(app, "student@example.com");
    const biology = await createCourse(app, auth, "Biology");

    await app.inject({
      method: "POST",
      url: "/tasks",
      headers: authHeaders(auth),
      payload: { courseId: biology.id, title: "Read chapter 8", dueDate: "2026-05-30" },
    });
    const conversation = await app.inject({
      method: "POST",
      url: "/conversations",
      headers: authHeaders(auth),
      payload: { title: "Planning", courseId: biology.id },
    });
    const firstReply = await app.inject({
      method: "POST",
      url: `/conversations/${conversation.json().conversation.id}/messages`,
      headers: authHeaders(auth),
      payload: { content: "Please make a study plan" },
    });
    const confirmedSuggestionId = firstReply.json().suggestedTasks[0].id;

    const firstConfirm = await app.inject({
      method: "POST",
      url: `/suggested-tasks/${confirmedSuggestionId}/confirm`,
      headers: authHeaders(auth),
    });
    const secondConfirm = await app.inject({
      method: "POST",
      url: `/suggested-tasks/${confirmedSuggestionId}/confirm`,
      headers: authHeaders(auth),
    });
    const dismissConfirmed = await app.inject({
      method: "POST",
      url: `/suggested-tasks/${confirmedSuggestionId}/dismiss`,
      headers: authHeaders(auth),
    });

    expect(firstConfirm.statusCode).toBe(200);
    expect(secondConfirm.statusCode).toBe(409);
    expect(secondConfirm.json()).toMatchObject({
      error: { code: "SUGGESTED_TASK_NOT_PENDING" },
    });
    expect(dismissConfirmed.statusCode).toBe(409);
    expect(dismissConfirmed.json()).toMatchObject({
      error: { code: "SUGGESTED_TASK_NOT_PENDING" },
    });

    const secondReply = await app.inject({
      method: "POST",
      url: `/conversations/${conversation.json().conversation.id}/messages`,
      headers: authHeaders(auth),
      payload: { content: "Please make another study plan" },
    });
    const dismissedSuggestionId = secondReply.json().suggestedTasks[0].id;
    const firstDismiss = await app.inject({
      method: "POST",
      url: `/suggested-tasks/${dismissedSuggestionId}/dismiss`,
      headers: authHeaders(auth),
    });
    const secondDismiss = await app.inject({
      method: "POST",
      url: `/suggested-tasks/${dismissedSuggestionId}/dismiss`,
      headers: authHeaders(auth),
    });
    const confirmDismissed = await app.inject({
      method: "POST",
      url: `/suggested-tasks/${dismissedSuggestionId}/confirm`,
      headers: authHeaders(auth),
    });

    expect(firstDismiss.statusCode).toBe(200);
    expect(secondDismiss.statusCode).toBe(409);
    expect(secondDismiss.json()).toMatchObject({
      error: { code: "SUGGESTED_TASK_NOT_PENDING" },
    });
    expect(confirmDismissed.statusCode).toBe(409);
    expect(confirmDismissed.json()).toMatchObject({
      error: { code: "SUGGESTED_TASK_NOT_PENDING" },
    });
    expect(store.suggestedTasks.find((suggestion) => suggestion.id === confirmedSuggestionId)).toMatchObject({
      state: "CONFIRMED",
    });
    expect(store.suggestedTasks.find((suggestion) => suggestion.id === dismissedSuggestionId)).toMatchObject({
      state: "DISMISSED",
      createdTaskId: null,
    });

    await app.close();
  });
});
