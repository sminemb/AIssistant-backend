import fp from "fastify-plugin";
import type { FastifyReply, FastifyRequest } from "fastify";

import { prisma } from "../db/prisma.js";
import { HttpError } from "../http/errors.js";
import {
  csrfCookieName,
  newOpaqueToken,
  readSession,
  safeEqual,
  sessionCookieName,
} from "../auth/session.js";

const unsafeMethods = new Set(["POST", "PATCH", "PUT", "DELETE"]);

export const authPlugin = fp(async (app) => {
  app.decorateRequest("user", null);

  app.addHook("preHandler", async (request, reply) => {
    const sessionToken = request.cookies[sessionCookieName];
    request.user = await readSession(prisma, sessionToken);

    const isAuthenticated = request.user;
    if (isAuthenticated && unsafeMethods.has(request.method)) {
      const headerToken = request.headers["x-csrf-token"];
      const csrfHeader = Array.isArray(headerToken) ? headerToken[0] : headerToken;
      const csrfCookie = request.cookies[csrfCookieName];

      if (!safeEqual(csrfHeader, csrfCookie)) {
        throw new HttpError(403, "CSRF_TOKEN_INVALID", "CSRF token is missing or invalid");
      }
    }
  });

  app.decorate("requireUser", async (request: FastifyRequest) => {
    if (!request.user) {
      throw new HttpError(401, "AUTH_REQUIRED", "Authentication is required");
    }

    return request.user;
  });

  app.decorate("requireAdmin", async (request: FastifyRequest) => {
    const user = await app.requireUser(request);
    if (user.role !== "ADMIN") {
      throw new HttpError(403, "ADMIN_REQUIRED", "Admin access is required");
    }

    return user;
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