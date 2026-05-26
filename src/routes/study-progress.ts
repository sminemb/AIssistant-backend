import type { FastifyInstance } from "fastify";
import { prisma } from "../db/prisma.js";

export async function studyProgressRoutes(app: FastifyInstance) {
  app.get("/study-progress", async (request) => {
    const user = await app.requireUser(request);

    // Fetch all completed quizzes for this user
    const completedQuizzes = await prisma.quiz.findMany({
      where: { userId: user.id, state: "COMPLETED", score: { not: null } },
      select: { quizTopic: true, score: true },
    });

    // Calculate metrics
    const highestScoresByTopic = new Map<string, number>();
    for (const quiz of completedQuizzes) {
      const currentMax = highestScoresByTopic.get(quiz.quizTopic.toLowerCase()) ?? 0;
      highestScoresByTopic.set(quiz.quizTopic.toLowerCase(), Math.max(currentMax, quiz.score ?? 0));
    }

    const totalQuizzes = completedQuizzes.length;
    const completedTopics = highestScoresByTopic.size;
    const scores = Array.from(highestScoresByTopic.values());
    const averageScore = scores.length === 0 ? 0 : scores.reduce((a, b) => a + b, 0) / scores.length;

    // Update progress record
    const studyProgress = await prisma.studyProgress.upsert({
      where: { userId: user.id },
      update: { completedTopics, totalQuizzes, averageScore },
      create: { userId: user.id, completedTopics, totalQuizzes, averageScore },
    });

    // Return the progress with extra topic-specific data for the UI
    return { 
        studyProgress,
        topicBreakdown: Object.fromEntries(highestScoresByTopic)
    };
  });
}