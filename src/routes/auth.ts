import bcrypt from "bcryptjs";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import {
  createSession,
  csrfCookieName,
  publicUser,
  revokeSession,
  sessionCookieName,
} from "../auth/session.js";
import { prisma } from "../db/prisma.js";
import { HttpError } from "../http/errors.js";
import { parseBody } from "../http/validation.js";

const registerSchema = z.object({
  email: z.string().email().transform((value) => value.toLowerCase()),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters long")
    .regex(/[0-9]/, "Password must contain at least one number"),
  name: z.string().trim().min(1).max(120),
});

const loginSchema = z.object({
  email: z.string().email().transform((value) => value.toLowerCase()),
  password: z.string().min(1),
  role: z.enum(["STUDENT", "ADMIN"]).optional(),
});

function setSessionCookie(app: FastifyInstance, token: string, expiresAt: Date) {
  return {
    path: "/",
    httpOnly: true,
    sameSite: "none" as const,
    secure: true,
    expires: expiresAt,
  };
}

function authUserPayload(user: Parameters<typeof publicUser>[0]) {
  const dto = publicUser(user);
  return { user: dto, student: dto };
}

export async function authRoutes(app: FastifyInstance) {
  app.get("/auth/csrf", async (request, reply) => {
    const csrfToken = await app.issueCsrfToken(request, reply);
    return { csrfToken };
  });

  app.post("/auth/register", async (request, reply) => {
    const body = parseBody(request, registerSchema);
    const existing = await prisma.user.findUnique({ where: { email: body.email } });

    if (existing) {
      throw new HttpError(409, "EMAIL_ALREADY_REGISTERED", "A user with this email already exists");
    }

    const passwordHash = await bcrypt.hash(body.password, 12);
    const user = await prisma.user.create({
      data: {
        email: body.email,
        passwordHash,
        name: body.name,
        studyProgress: { create: {} },
      },
    });

    await prisma.systemLog.create({
      data: { userId: user.id, action: "User registered" }
    });

    const session = await createSession(prisma, user.id);
    await app.issueCsrfToken(request, reply);

    reply.setCookie(sessionCookieName, session.token, setSessionCookie(app, session.token, session.expiresAt));
    return reply.status(201).send(authUserPayload(user));
  });

  app.post("/auth/login", async (request, reply) => {
    const body = parseBody(request, loginSchema);
    const user = await prisma.user.findUnique({ where: { email: body.email } });

    if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) {
      throw new HttpError(401, "INVALID_CREDENTIALS", "Email or password is incorrect");
    }

    if (body.role && user.role !== body.role) {
      throw new HttpError(403, "ACCESS_DENIED", `Access denied. ${body.role} privileges required.`);
    }

    await prisma.systemLog.create({
      data: { userId: user.id, action: "User logged in" }
    });

    const session = await createSession(prisma, user.id);
    await app.issueCsrfToken(request, reply);

    reply.setCookie(sessionCookieName, session.token, setSessionCookie(app, session.token, session.expiresAt));
    return authUserPayload(user);
  });

  app.post("/auth/logout", async (request, reply) => {
    const sessionToken = request.cookies[sessionCookieName];
    const session = await prisma.session.findUnique({ where: { tokenHash: sessionToken } });
    
    if (session) {
      await prisma.systemLog.create({
        data: { userId: session.userId, action: "User logged out" }
      });
    }

    await revokeSession(prisma, sessionToken);
    reply.clearCookie(sessionCookieName, { path: "/" });
    reply.clearCookie(csrfCookieName, { path: "/" });
    return reply.status(204).send();
  });

  app.get("/auth/me", async (request) => {
    const user = await app.requireUser(request);
    return authUserPayload(user);
  });
}
