import type { FastifyInstance } from "fastify";

import { prisma } from "../db/prisma.js";

export async function dashboardRoutes(app: FastifyInstance) {
  app.get("/dashboard/summary", async (request) => {
    const user = await app.requireUser(request);
    const [recentConversations, recentQuizzes, studyProgress] = await Promise.all([
      prisma.conversation.findMany({
        where: { userId: user.id },
        orderBy: { updatedAt: "desc" },
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

    // Simple placeholder for recommendations
    const recommendations = [
      { topic: "Quantum Mechanics", questions: 12 },
      { topic: "Organic Chemistry", questions: 8 },
    ];

    return {
      recentConversations,
      recentQuizzes,
      studyProgress,
      recommendations,
    };
  });
}