import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({
  students: [] as Array<{
    id: string;
    email: string;
    passwordHash: string;
    displayName: string;
    timezone: string;
    avatarColor: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>,
  sessions: [] as Array<{
    id: string;
    studentId: string;
    tokenHash: string;
    expiresAt: Date;
    revokedAt: Date | null;
    createdAt: Date;
  }>,
}));

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
    findUnique: vi.fn(async ({ where }: { where: { tokenHash: string }; include?: { student?: boolean } }) => {
      const session = store.sessions.find((candidate) => candidate.tokenHash === where.tokenHash);

      if (!session) {
        return null;
      }

      return {
        ...session,
        student: store.students.find((student) => student.id === session.studentId) ?? null,
      };
    }),
    updateMany: vi.fn(async ({ where, data }: { where: { tokenHash: string; revokedAt: null }; data: { revokedAt: Date } }) => {
      let count = 0;

      for (const session of store.sessions) {
        if (session.tokenHash === where.tokenHash && session.revokedAt === where.revokedAt) {
          session.revokedAt = data.revokedAt;
          count += 1;
        }
      }

      return { count };
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
  FRONTEND_ORIGINS: "http://localhost:3000,https://app.example.com",
};

function cookieHeader(setCookies: string[]) {
  return setCookies.map((cookie) => cookie.split(";")[0]).join("; ");
}

function cookieValue(setCookies: string[], name: string) {
  const prefix = `${name}=`;
  const cookie = setCookies.find((candidate) => candidate.startsWith(prefix));
  return cookie?.slice(prefix.length).split(";")[0];
}

describe("auth HTTP contract", () => {
  beforeEach(() => {
    store.students = [];
    store.sessions = [];
    vi.clearAllMocks();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
  });

  it("registers a Student and recovers logged-in state from an HTTP-only session cookie", async () => {
    const app = await buildServer(env);

    const register = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        email: "Student@Example.com",
        password: "correct horse battery staple",
        displayName: "Ada Student",
        timezone: "Asia/Manila",
        avatarColor: "blue",
      },
    });
    const setCookieHeader = register.headers["set-cookie"];
    const setCookies = Array.isArray(setCookieHeader) ? setCookieHeader : [String(setCookieHeader)];

    expect(register.statusCode).toBe(201);
    expect(register.json()).toMatchObject({
      student: {
        email: "student@example.com",
        displayName: "Ada Student",
        timezone: "Asia/Manila",
        avatarColor: "blue",
      },
    });
    expect(register.body).not.toContain("passwordHash");
    expect(setCookies.some((cookie) => cookie.startsWith("aissistant_session=") && cookie.includes("HttpOnly"))).toBe(true);

    const me = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { cookie: cookieHeader(setCookies) },
    });

    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({
      student: {
        email: "student@example.com",
        displayName: "Ada Student",
        timezone: "Asia/Manila",
        avatarColor: "blue",
      },
    });

    await app.close();
  });

  it("logs in and logs out a Student using the session cookie and CSRF token", async () => {
    const app = await buildServer(env);

    await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        email: "student@example.com",
        password: "correct horse battery staple",
        displayName: "Ada Student",
        timezone: "Asia/Manila",
      },
    });

    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "student@example.com",
        password: "correct horse battery staple",
      },
    });
    const loginSetCookieHeader = login.headers["set-cookie"];
    const loginSetCookies = Array.isArray(loginSetCookieHeader) ? loginSetCookieHeader : [String(loginSetCookieHeader)];
    const csrfToken = cookieValue(loginSetCookies, "aissistant_csrf");

    expect(login.statusCode).toBe(200);
    expect(login.json()).toMatchObject({
      student: {
        email: "student@example.com",
        displayName: "Ada Student",
        timezone: "Asia/Manila",
      },
    });
    expect(csrfToken).toBeTruthy();

    const logout = await app.inject({
      method: "POST",
      url: "/auth/logout",
      headers: {
        cookie: cookieHeader(loginSetCookies),
        "x-csrf-token": csrfToken,
      },
    });

    expect(logout.statusCode).toBe(204);

    const me = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { cookie: cookieHeader(loginSetCookies) },
    });

    expect(me.statusCode).toBe(401);
    expect(me.json()).toMatchObject({
      error: { code: "AUTH_REQUIRED" },
    });

    await app.close();
  });

  it("rejects unsafe cookie-authenticated requests without a valid CSRF token", async () => {
    const app = await buildServer(env);

    const register = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        email: "student@example.com",
        password: "correct horse battery staple",
        displayName: "Ada Student",
        timezone: "Asia/Manila",
      },
    });
    const setCookieHeader = register.headers["set-cookie"];
    const setCookies = Array.isArray(setCookieHeader) ? setCookieHeader : [String(setCookieHeader)];

    const logout = await app.inject({
      method: "POST",
      url: "/auth/logout",
      headers: { cookie: cookieHeader(setCookies) },
    });

    expect(logout.statusCode).toBe(403);
    expect(logout.json()).toMatchObject({
      error: { code: "CSRF_TOKEN_INVALID" },
    });

    await app.close();
  });

  it("returns stable auth error envelopes", async () => {
    const app = await buildServer(env);

    const unauthenticatedMe = await app.inject({
      method: "GET",
      url: "/auth/me",
    });

    expect(unauthenticatedMe.statusCode).toBe(401);
    expect(unauthenticatedMe.json()).toMatchObject({
      error: { code: "AUTH_REQUIRED", message: expect.any(String) },
    });

    const invalidLogin = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "missing@example.com",
        password: "wrong",
      },
    });

    expect(invalidLogin.statusCode).toBe(401);
    expect(invalidLogin.json()).toMatchObject({
      error: { code: "INVALID_CREDENTIALS", message: expect.any(String) },
    });

    await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        email: "student@example.com",
        password: "correct horse battery staple",
        displayName: "Ada Student",
        timezone: "Asia/Manila",
      },
    });
    const duplicateRegister = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        email: "student@example.com",
        password: "correct horse battery staple",
        displayName: "Ada Student",
        timezone: "Asia/Manila",
      },
    });

    expect(duplicateRegister.statusCode).toBe(409);
    expect(duplicateRegister.json()).toMatchObject({
      error: { code: "EMAIL_ALREADY_REGISTERED", message: expect.any(String) },
    });

    await app.close();
  });

  it("allows CORS only for configured frontend origins", async () => {
    const app = await buildServer(env);

    const allowed = await app.inject({
      method: "OPTIONS",
      url: "/auth/login",
      headers: {
        origin: "https://app.example.com",
        "access-control-request-method": "POST",
      },
    });

    expect(allowed.statusCode).toBe(204);
    expect(allowed.headers["access-control-allow-origin"]).toBe("https://app.example.com");
    expect(allowed.headers["access-control-allow-credentials"]).toBe("true");

    const disallowed = await app.inject({
      method: "OPTIONS",
      url: "/auth/login",
      headers: {
        origin: "https://evil.example.com",
        "access-control-request-method": "POST",
      },
    });

    expect(disallowed.statusCode).toBe(404);
    expect(disallowed.headers["access-control-allow-origin"]).toBeUndefined();
    expect(disallowed.headers["access-control-allow-credentials"]).toBeUndefined();

    await app.close();
  });
});
