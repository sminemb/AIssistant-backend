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

const store = vi.hoisted(() => ({
  students: [] as StudentRecord[],
  sessions: [] as SessionRecord[],
  courses: [] as CourseRecord[],
  conversations: [] as ConversationRecord[],
  messages: [] as MessageRecord[],
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

  return {
    ...conversation,
    ...(include?.course ? { course: store.courses.find((course) => course.id === conversation.courseId) ?? null } : {}),
    ...(include?.messages ? { messages } : {}),
    ...(include?.suggestedTasks ? { suggestedTasks: [] } : {}),
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
    findMany: vi.fn(async () => []),
  },
  todayTask: {
    findMany: vi.fn(async () => []),
  },
  suggestedTask: {
    create: vi.fn(),
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

describe("Conversation and Message lifecycle HTTP contract", () => {
  beforeEach(() => {
    store.students = [];
    store.sessions = [];
    store.courses = [];
    store.conversations = [];
    store.messages = [];
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
});
