import fp from "fastify-plugin";
import type { FastifyReply, FastifyRequest } from "fastify";

import { prisma } from "../db/prisma.js";
import { HttpError } from "../http/errors.js";
import {
  csrfCookieName,
  newOpaqueToken,
  readSessionStudent,
  safeEqual,
  sessionCookieName,
} from "../auth/session.js";

const unsafeMethods = new Set(["POST", "PATCH", "PUT", "DELETE"]);

export const authPlugin = fp(async (app) => {
  app.decorateRequest("student", null);

  app.addHook("preHandler", async (request, reply) => {
    const token = request.cookies[sessionCookieName];
    request.student = await readSessionStudent(prisma, token);

    if (request.student && unsafeMethods.has(request.method)) {
      const headerToken = request.headers["x-csrf-token"];
      const csrfHeader = Array.isArray(headerToken) ? headerToken[0] : headerToken;
      const csrfCookie = request.cookies[csrfCookieName];

      if (!safeEqual(csrfHeader, csrfCookie)) {
        throw new HttpError(403, "CSRF_TOKEN_INVALID", "CSRF token is missing or invalid");
      }
    }
  });

  app.decorate("requireStudent", async (request: FastifyRequest) => {
    if (!request.student) {
      throw new HttpError(401, "AUTH_REQUIRED", "Authentication is required");
    }

    return request.student;
  });

  app.decorate("issueCsrfToken", async (_request: FastifyRequest, reply: FastifyReply) => {
    const token = newOpaqueToken();
    reply.setCookie(csrfCookieName, token, {
      path: "/",
      httpOnly: false,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
    return token;
  });
});
