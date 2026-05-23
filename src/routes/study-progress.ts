import type { FastifyInstance } from "fastify";

import { prisma } from "../db/prisma.js";

export async function studyProgressRoutes(app: FastifyInstance) {
  app.get("/study-progress", async (request) => {
    const student = await app.requireStudent(request);
    const studyProgress = await prisma.studyProgress.upsert({
      where: { studentId: student.id },
      update: {},
      create: { studentId: student.id },
    });

    return { studyProgress };
  });
}
