import type { FastifyInstance } from "fastify";

import { prisma } from "../db/prisma.js";

export async function dashboardRoutes(app: FastifyInstance) {
  app.get("/dashboard/summary", async (request) => {
    const user = await app.requireUser(request);
    const [recentStudyQuestions, recentQuizzes, studyProgress] = await Promise.all([
      prisma.studyQuestion.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      prisma.quiz.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      prisma.studyProgress.upsert({
        where: { userId: user.id },
        update: {},
        create: { userId: user.id },
      }),
    ]);

    return {
      recentStudyQuestions,
      recentQuizzes,
      studyProgress,
    };
  });
}