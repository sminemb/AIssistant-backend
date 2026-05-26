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

    // Calculate recommendations based on low scores
    const allCompletedQuizzes = await prisma.quiz.findMany({
      where: { userId: user.id, state: "COMPLETED", score: { not: null } },
      orderBy: { createdAt: "desc" },
    });

    const topicScores = new Map<string, { totalScore: number; count: number }>();
    for (const quiz of allCompletedQuizzes) {
        const stats = topicScores.get(quiz.quizTopic) || { totalScore: 0, count: 0 };
        stats.totalScore += quiz.score || 0;
        stats.count += 1;
        topicScores.set(quiz.quizTopic, stats);
    }

    const recommendations = Array.from(topicScores.entries())
        .map(([topic, stats]) => ({ topic, avgScore: stats.totalScore / stats.count }))
        .sort((a, b) => a.avgScore - b.avgScore) // Lowest score first
        .slice(0, 3)
        .map(r => ({ topic: r.topic, questions: 5 })); // Placeholder question count

    return {
      recentConversations,
      recentQuizzes,
      studyProgress,
      recommendations,
    };
  });
}