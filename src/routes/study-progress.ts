import type { FastifyInstance } from "fastify";

import { prisma } from "../db/prisma.js";

export async function studyProgressRoutes(app: FastifyInstance) {
  app.get("/study-progress", async (request) => {
    const user = await app.requireUser(request);
    const studyProgress = await prisma.studyProgress.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id },
    });

    return { studyProgress };
  });
}