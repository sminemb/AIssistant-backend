import type { FastifyInstance } from "fastify";
import { prisma } from "../db/prisma.js";

export async function studyProgressRoutes(app: FastifyInstance) {
  app.get("/study-progress", async (request) => {
    const user = await app.requireUser(request);

    // Fetch all completed quizzes for this user
    const completedQuizzes = await prisma.quiz.findMany({
      where: { userId: user.id, state: "COMPLETED", score: { not: null } },
      select: { quizTopic: true, score: true, createdAt: true },
    });

    // Calculate unique days active
    const activeDays = new Set(completedQuizzes.map(q => q.createdAt.toDateString())).size;

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

    // Generate insights
    const insights: string[] = [];
    if (completedQuizzes.length > 0) {
        const sortedTopics = Array.from(highestScoresByTopic.entries()).sort((a, b) => b[1] - a[1]);
        
        // Filter out topics with 100% mastery
        const needsReview = sortedTopics.filter(([, score]) => score < 100);
        const mastered = sortedTopics.filter(([, score]) => score === 100);

        if (mastered.length > 0) {
             insights.push(`You have completely mastered ${mastered.length > 1 ? 'topics like ' : ''}${mastered.map(t => t[0]).join(', ')}.`);
        }

        if (needsReview.length > 0) {
            const worst = needsReview[needsReview.length - 1];
            insights.push(`Consider reviewing ${worst[0]}, your current lowest score is ${Math.round(worst[1])}%.`);
        } else if (mastered.length > 0) {
            insights.push("You've mastered everything! Time for a break or a new challenge.");
        }
    } else {
        insights.push("Start taking quizzes to see your study insights!");
    }

    // Return the progress with extra topic-specific data for the UI
    return {
        studyProgress: { ...studyProgress, activeDays },
        topicBreakdown: Object.fromEntries(highestScoresByTopic),
        insights
    };  });
}