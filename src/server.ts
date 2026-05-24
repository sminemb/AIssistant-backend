import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import Fastify from "fastify";

import type { AppEnv } from "./config/env.js";
import { frontendOrigins } from "./config/env.js";
import { prisma } from "./db/prisma.js";
import { sendError } from "./http/errors.js";
import { authPlugin } from "./plugins/auth.js";
import { adminRoutes } from "./routes/admin.js";
import { authRoutes } from "./routes/auth.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { quizzesRoutes } from "./routes/quizzes.js";
import { studyProgressRoutes } from "./routes/study-progress.js";
import { studyQuestionsRoutes } from "./routes/study-questions.js";

export async function buildServer(env: AppEnv) {
  const app = Fastify({ logger: env.NODE_ENV !== "test" });
  const allowedOrigins = frontendOrigins(env);

  app.decorate("config", env);

  await app.register(helmet);
  await app.register(cors, {
    credentials: true,
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(null, false);
    },
  });
  await app.register(cookie, { secret: env.SESSION_SECRET });
  await app.register(authPlugin);

  app.setErrorHandler((error, request, reply) => {
    try {
      return sendError(reply, error);
    } catch (unhandled) {
      request.log.error(unhandled);
      return reply.status(500).send({
        error: { code: "INTERNAL_SERVER_ERROR", message: "Internal server error" },
      });
    }
  });
  app.setNotFoundHandler(async (_request, reply) => {
    return reply.status(404).send({
      error: { code: "ROUTE_NOT_FOUND", message: "Route not found" },
    });
  });

  app.get("/health", async () => ({ ok: true }));

  await app.register(authRoutes);
  await app.register(adminRoutes);
  await app.register(dashboardRoutes);
  await app.register(studyQuestionsRoutes);
  await app.register(quizzesRoutes);
  await app.register(studyProgressRoutes);

  app.addHook("onClose", async () => {
    await prisma.$disconnect();
  });

  return app;
}
