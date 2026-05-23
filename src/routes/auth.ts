import bcrypt from "bcryptjs";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import {
  createSession,
  csrfCookieName,
  publicStudent,
  revokeSession,
  sessionCookieName,
} from "../auth/session.js";
import { prisma } from "../db/prisma.js";
import { HttpError } from "../http/errors.js";
import { parseBody } from "../http/validation.js";

const registerSchema = z.object({
  email: z.string().email().transform((value) => value.toLowerCase()),
  password: z.string().min(8),
  name: z.string().trim().min(1).max(120),
});

const loginSchema = z.object({
  email: z.string().email().transform((value) => value.toLowerCase()),
  password: z.string().min(1),
});

function setSessionCookie(app: FastifyInstance, token: string, expiresAt: Date) {
  return {
    path: "/",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: app.config.NODE_ENV === "production",
    expires: expiresAt,
  };
}

export async function authRoutes(app: FastifyInstance) {
  app.get("/auth/csrf", async (request, reply) => {
    const csrfToken = await app.issueCsrfToken(request, reply);
    return { csrfToken };
  });

  app.post("/auth/register", async (request, reply) => {
    const body = parseBody(request, registerSchema);
    const existing = await prisma.student.findUnique({ where: { email: body.email } });

    if (existing) {
      throw new HttpError(409, "EMAIL_ALREADY_REGISTERED", "A Student with this email already exists");
    }

    const passwordHash = await bcrypt.hash(body.password, 12);
    const student = await prisma.student.create({
      data: {
        email: body.email,
        passwordHash,
        name: body.name,
        studyProgress: { create: {} },
      },
    });
    const session = await createSession(prisma, student.id);
    await app.issueCsrfToken(request, reply);

    reply.setCookie(sessionCookieName, session.token, setSessionCookie(app, session.token, session.expiresAt));
    return reply.status(201).send({ student: publicStudent(student) });
  });

  app.post("/auth/login", async (request, reply) => {
    const body = parseBody(request, loginSchema);
    const student = await prisma.student.findUnique({ where: { email: body.email } });

    if (!student || !(await bcrypt.compare(body.password, student.passwordHash))) {
      throw new HttpError(401, "INVALID_CREDENTIALS", "Email or password is incorrect");
    }

    const session = await createSession(prisma, student.id);
    await app.issueCsrfToken(request, reply);

    reply.setCookie(sessionCookieName, session.token, setSessionCookie(app, session.token, session.expiresAt));
    return { student: publicStudent(student) };
  });

  app.post("/auth/logout", async (request, reply) => {
    await revokeSession(prisma, request.cookies[sessionCookieName]);
    reply.clearCookie(sessionCookieName, { path: "/" });
    reply.clearCookie(csrfCookieName, { path: "/" });
    return reply.status(204).send();
  });

  app.get("/auth/me", async (request) => {
    const student = await app.requireStudent(request);
    return { student: publicStudent(student) };
  });
}
