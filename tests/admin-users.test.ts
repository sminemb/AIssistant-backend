import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type UserRecord = {
  id: number;
  name: string;
  email: string;
  passwordHash: string;
  role: "STUDENT" | "ADMIN";
  createdAt: Date;
  updatedAt?: Date;
};

type SessionRecord = {
  id: number;
  userId: number;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
};

const store = vi.hoisted(() => ({
  nextId: 1,
  users: [] as UserRecord[],
  sessions: [] as SessionRecord[],
}));

function nextId() {
  store.nextId += 1;
  return store.nextId - 1;
}

const prismaMock = vi.hoisted(() => ({
  user: {
    findMany: vi.fn(async ({ select, orderBy }: { select: any; orderBy: any }) => {
      const sortedUsers = [...store.users].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      return sortedUsers.map(user => {
        const selected: any = {};
        for (const key in select) {
          if (user.hasOwnProperty(key)) {
            selected[key] = user[key as keyof UserRecord];
          }
        }
        return selected;
      });
    }),
    findUnique: vi.fn(async ({ where }: { where: { id?: number; email?: string } }) => {
      if (where.email) {
        return store.users.find((user) => user.email === where.email) ?? null;
      }
      if (where.id) {
        return store.users.find((user) => user.id === where.id) ?? null;
      }
      return null;
    }),
    create: vi.fn(async ({ data }: { data: { email: string; passwordHash: string; name: string; role?: "STUDENT" | "ADMIN" } }) => {
      const user = {
        id: nextId(),
        email: data.email,
        passwordHash: data.passwordHash,
        name: data.name,
        role: data.role ?? "STUDENT",
        createdAt: new Date(),
      };
      store.users.push(user);
      return user;
    }),
    update: vi.fn(async ({ where, data }: { where: { id: number }; data: Partial<UserRecord> }) => {
      const userIndex = store.users.findIndex((user) => user.id === where.id);
      if (userIndex === -1) throw new Error("User not found for update");
      store.users[userIndex] = { ...store.users[userIndex], ...data, updatedAt: new Date() };
      return store.users[userIndex];
    }),
    count: vi.fn(async ({ where }: { where: { role: "ADMIN" | "STUDENT" } }) => {
      return store.users.filter(user => user.role === where.role).length;
    }),
    delete: vi.fn(async ({ where }: { where: { id: number } }) => {
      const userIndex = store.users.findIndex((user) => user.id === where.id);
      if (userIndex === -1) throw new Error("User not found for deletion");
      const [deletedUser] = store.users.splice(userIndex, 1);
      return deletedUser;
    }),
  },
  session: {
    create: vi.fn(async ({ data }: { data: { userId: number; tokenHash: string; expiresAt: Date } }) => {
      const session = { id: nextId(), userId: data.userId, tokenHash: data.tokenHash, expiresAt: data.expiresAt, revokedAt: null, createdAt: new Date() };
      store.sessions.push(session);
      return session;
    }),
    findUnique: vi.fn(async ({ where }: { where: { tokenHash: string }; include?: { user?: boolean } }) => {
      const session = store.sessions.find((candidate) => candidate.tokenHash === where.tokenHash);
      return session ? { ...session, user: store.users.find((user) => user.id === session.userId) ?? null } : null;
    }),
    updateMany: vi.fn(async () => ({ count: 0 }) as any),
  },
  systemLog: {
    create: vi.fn(async () => ({ id: nextId() })),
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

function getCookies(response: any) {
  const setCookie = response.headers["set-cookie"];
  if (!setCookie) return [];
  return Array.isArray(setCookie) ? setCookie : [setCookie];
}

function cookieHeader(cookies: string[]) {
  return cookies.map((cookie) => cookie.split(";")[0]).join("; ");
}

async function registerAndLoginAdmin(email = "admin@example.com", name = "Admin User") {
  const app = await buildServer(env);
  const register = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { name, email, password: "AdminPassword1!" },
  });
  
  // Directly set the role to ADMIN for the test user in the mock store immediately
  const adminUser = store.users.find(u => u.email === email);
  if (adminUser) {
    adminUser.role = "ADMIN";
  }

  const login = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email, password: "AdminPassword1!" },
  });

  const cookies = getCookies(login);
  const csrf = await app.inject({ method: "GET", url: "/admin/csrf", headers: { cookie: cookieHeader(cookies) } });
  
  const csrfCookies = getCookies(csrf);
  const allCookies = [...cookies, ...csrfCookies];
  const csrfToken = JSON.parse(csrf.body).csrfToken as string;
  return { app, cookies: allCookies, csrfToken, adminUser };
}

async function registerAndLoginStudent() {
    const app = await buildServer(env);
    const register = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { name: "Student User", email: "student@example.com", password: "StudentPassword1!" },
    });
  
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "student@example.com", password: "StudentPassword1!" },
    });
  
    const cookies = getCookies(login);
    const csrf = await app.inject({ method: "GET", url: "/admin/csrf", headers: { cookie: cookieHeader(cookies) } });
    
    const csrfCookies = getCookies(csrf);
    const allCookies = [...cookies, ...csrfCookies];
    const csrfToken = JSON.parse(csrf.body).csrfToken as string;
    return { app, cookies: allCookies, csrfToken, studentUser: store.users.find(u => u.email === "student@example.com") };
  }


describe("Admin User Management HTTP Contract", () => {
  beforeEach(() => {
    store.nextId = 1;
    store.users = [];
    store.sessions = [];
    vi.clearAllMocks();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
  });

  it("an admin can edit a student user's name and email", async () => {
    const { app, cookies, csrfToken, adminUser } = await registerAndLoginAdmin();
    const { studentUser } = await registerAndLoginStudent();

    const response = await app.inject({
      method: "PATCH",
      url: `/admin/users/${studentUser?.id}`,
      headers: { cookie: cookieHeader(cookies), "x-csrf-token": csrfToken },
      payload: { name: "Updated Student", email: "updated_student@example.com" },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).user).toMatchObject({
      name: "Updated Student",
      email: "updated_student@example.com",
    });
    expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: studentUser?.id },
        data: { name: "Updated Student", email: "updated_student@example.com" },
    });

    await app.close();
  });

  it("an admin cannot edit a user's email to an already existing email", async () => {
    const { app, cookies, csrfToken, adminUser } = await registerAndLoginAdmin();
    const { studentUser } = await registerAndLoginStudent();
    
    // Create another student with an email that conflicts
    await app.inject({
        method: "POST",
        url: "/auth/register",
        payload: { name: "Another Student", email: "another@example.com", password: "Password1!" },
    });

    const response = await app.inject({
      method: "PATCH",
      url: `/admin/users/${studentUser?.id}`,
      headers: { cookie: cookieHeader(cookies), "x-csrf-token": csrfToken },
      payload: { email: "another@example.com" }, // Attempt to change to an existing email
    });

    expect(response.statusCode).toBe(409);
    expect(JSON.parse(response.body).error.code).toBe("EMAIL_ALREADY_REGISTERED");

    await app.close();
  });

  it("a non-admin cannot edit a user", async () => {
    const { app, adminUser } = await registerAndLoginAdmin();
    const { cookies, csrfToken, studentUser } = await registerAndLoginStudent();

    const response = await app.inject({
      method: "PATCH",
      url: `/admin/users/${adminUser?.id}`,
      headers: { cookie: cookieHeader(cookies), "x-csrf-token": csrfToken },
      payload: { name: "Attempted Edit" },
    });

    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body).error.code).toBe("ADMIN_REQUIRED");

    await app.close();
  });

  it("an admin can promote a student to admin", async () => {
    const { app, cookies, csrfToken, adminUser } = await registerAndLoginAdmin();
    const { studentUser } = await registerAndLoginStudent();

    const response = await app.inject({
      method: "PATCH",
      url: `/admin/users/${studentUser?.id}/role`,
      headers: { cookie: cookieHeader(cookies), "x-csrf-token": csrfToken },
      payload: { role: "ADMIN" },
    });
    
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).user).toMatchObject({ role: "ADMIN" });
    expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: studentUser?.id },
        data: { role: "ADMIN" },
    });

    await app.close();
  });

  it("an admin can demote an admin to student (if not the last admin)", async () => {
    const { app, cookies, csrfToken, adminUser } = await registerAndLoginAdmin();
    // Create a second admin
    const { adminUser: secondAdmin } = await registerAndLoginAdmin("second-admin@example.com", "Second Admin");
    const secondAdminRecord = store.users.find(u => u.id === secondAdmin?.id);
    if (secondAdminRecord) secondAdminRecord.role = "ADMIN";


    const response = await app.inject({
      method: "PATCH",
      url: `/admin/users/${secondAdmin?.id}/role`,
      headers: { cookie: cookieHeader(cookies), "x-csrf-token": csrfToken },
      payload: { role: "STUDENT" },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).user).toMatchObject({ role: "STUDENT" });
    expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: secondAdmin?.id },
        data: { role: "STUDENT" },
    });

    await app.close();
  });

  it("an admin cannot demote the last admin", async () => {
    const { app, cookies, csrfToken, adminUser } = await registerAndLoginAdmin();
    // adminUser is the only admin

    const response = await app.inject({
      method: "PATCH",
      url: `/admin/users/${adminUser?.id}/role`,
      headers: { cookie: cookieHeader(cookies), "x-csrf-token": csrfToken },
      payload: { role: "STUDENT" },
    });

    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body).error.code).toBe("CANNOT_DEMOTE_LAST_ADMIN");

    await app.close();
  });

  it("an admin cannot change their own role", async () => {
    const { app, cookies, csrfToken, adminUser } = await registerAndLoginAdmin();
    await registerAndLoginAdmin("second-admin@example.com", "Second Admin");

    const response = await app.inject({
      method: "PATCH",
      url: `/admin/users/${adminUser?.id}/role`,
      headers: { cookie: cookieHeader(cookies), "x-csrf-token": csrfToken },
      payload: { role: "STUDENT" },
    });

    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body).error.code).toBe("CANNOT_DEMOTE_SELF");
    
    await app.close();
  });

  it("a non-admin cannot change a user's role", async () => {
    const { app, adminUser } = await registerAndLoginAdmin();
    const { cookies, csrfToken, studentUser } = await registerAndLoginStudent();

    const response = await app.inject({
      method: "PATCH",
      url: `/admin/users/${adminUser?.id}/role`,
      headers: { cookie: cookieHeader(cookies), "x-csrf-token": csrfToken },
      payload: { role: "STUDENT" },
    });

    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body).error.code).toBe("ADMIN_REQUIRED");

    await app.close();
  });

  it("an admin can delete a student user", async () => {
    const { app, cookies, csrfToken, adminUser } = await registerAndLoginAdmin();
    const { studentUser } = await registerAndLoginStudent();

    const response = await app.inject({
      method: "DELETE",
      url: `/admin/users/${studentUser?.id}`,
      headers: { cookie: cookieHeader(cookies), "x-csrf-token": csrfToken },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).message).toBe("User deleted successfully");
    expect(store.users).not.toContainEqual(expect.objectContaining({ id: studentUser?.id }));

    await app.close();
  });

  it("an admin can delete another admin (if not the last admin)", async () => {
    const { app, cookies, csrfToken, adminUser } = await registerAndLoginAdmin();
    // Create a second admin
    const { adminUser: secondAdmin } = await registerAndLoginAdmin("second-admin@example.com", "Second Admin");
    const secondAdminRecord = store.users.find(u => u.id === secondAdmin?.id);
    if (secondAdminRecord) secondAdminRecord.role = "ADMIN";

    const response = await app.inject({
      method: "DELETE",
      url: `/admin/users/${secondAdmin?.id}`,
      headers: { cookie: cookieHeader(cookies), "x-csrf-token": csrfToken },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).message).toBe("User deleted successfully");
    expect(store.users).not.toContainEqual(expect.objectContaining({ id: secondAdmin?.id }));

    await app.close();
  });

  it("an admin cannot delete the last admin", async () => {
    const { app, cookies, csrfToken, adminUser } = await registerAndLoginAdmin();
    // adminUser is the only admin

    const response = await app.inject({
      method: "DELETE",
      url: `/admin/users/${adminUser?.id}`,
      headers: { cookie: cookieHeader(cookies), "x-csrf-token": csrfToken },
    });

    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body).error.code).toBe("CANNOT_DELETE_LAST_ADMIN");

    await app.close();
  });

  it("an admin cannot delete their own account", async () => {
    const { app, cookies, csrfToken, adminUser } = await registerAndLoginAdmin();
    // Create a second admin so adminUser is not the last admin
    const { adminUser: secondAdmin } = await registerAndLoginAdmin("second-admin@example.com", "Second Admin");
    const secondAdminRecord = store.users.find(u => u.id === secondAdmin?.id);
    if (secondAdminRecord) secondAdminRecord.role = "ADMIN";


    const response = await app.inject({
      method: "DELETE",
      url: `/admin/users/${adminUser?.id}`,
      headers: { cookie: cookieHeader(cookies), "x-csrf-token": csrfToken },
    });

    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body).error.code).toBe("CANNOT_DELETE_SELF");

    await app.close();
  });

  it("a non-admin cannot delete a user", async () => {
    const { app, adminUser } = await registerAndLoginAdmin();
    const { cookies, csrfToken, studentUser } = await registerAndLoginStudent();

    const response = await app.inject({
      method: "DELETE",
      url: `/admin/users/${adminUser?.id}`,
      headers: { cookie: cookieHeader(cookies), "x-csrf-token": csrfToken },
    });

    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body).error.code).toBe("ADMIN_REQUIRED");

    await app.close();
  });
});
