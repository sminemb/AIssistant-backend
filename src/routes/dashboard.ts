import type { FastifyInstance } from "fastify";

import { prisma } from "../db/prisma.js";

export async function dashboardRoutes(app: FastifyInstance) {
  app.get("/dashboard/summary", async (request) => {
    const user = await app.requireUser(request);
    const [recentConversations, recentQuizzes, studyProgress] = await Promise.all([
      prisma.conversation.findMany({
        where: { userId: user.id },
        orderBy: { updatedAt: "desc" },
        take: 20,
      }),
      prisma.quiz.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.studyProgress.upsert({
        where: { userId: user.id },
        update: {},
        create: { userId: user.id },
      }),
    ]);

    // Define a pool of diverse study topics
    const STUDY_TOPIC_POOL = [
        "World History",
        "Introduction to Philosophy",
        "Basic Psychology",
        "Environmental Science",
        "Creative Writing",
        "Art History",
        "Principles of Economics",
        "Literature Analysis",
        "Sociology Basics",
        "General Science"
    ];

    // Calculate recommendations based on low scores
    const allCompletedQuizzes = await prisma.quiz.findMany({
      where: { userId: user.id, state: "COMPLETED", score: { not: null } },
      orderBy: { createdAt: "desc" },
    });

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const lessonsCompletedThisWeek = allCompletedQuizzes.filter(quiz => quiz.createdAt >= sevenDaysAgo).length;

    const topicScores = new Map<string, { totalScore: number; count: number }>();
    for (const quiz of allCompletedQuizzes) {
        const stats = topicScores.get(quiz.quizTopic) || { totalScore: 0, count: 0 };
        stats.totalScore += quiz.score || 0;
        stats.count += 1;
        topicScores.set(quiz.quizTopic, stats);
    }

    const inferredRecommendations = Array.from(topicScores.entries())
        .map(([topic, stats]) => ({ topic, avgScore: stats.totalScore / stats.count }))
        .sort((a, b) => a.avgScore - b.avgScore) // Lowest score first
        .slice(0, 3)
        .map(r => ({ topic: r.topic, questions: 5 }));

    // Mix in randomized topics if not enough inferred ones
    let finalRecommendations = [...inferredRecommendations];
    
    if (finalRecommendations.length < 3) {
        const remainingNeeded = 3 - finalRecommendations.length;
        const shuffledPool = [...STUDY_TOPIC_POOL]
            .filter(topic => !finalRecommendations.some(r => r.topic === topic))
            .sort(() => 0.5 - Math.random());
            
        for (let i = 0; i < remainingNeeded; i++) {
            finalRecommendations.push({ topic: shuffledPool[i], questions: 5 });
        }
    }

    return {
      recentConversations,
      recentQuizzes,
      studyProgress,
      recommendations: finalRecommendations.slice(0, 3),
      lessonsCompletedThisWeek,
    };
  });
}