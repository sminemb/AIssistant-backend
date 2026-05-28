import type { FastifyInstance } from "fastify";
import { prisma } from "../db/prisma.js";

export async function studyProgressRoutes(app: FastifyInstance) {
  app.get("/study-progress", async (request) => {
    const user = await app.requireUser(request);

    // Fetch all completed quizzes for this user
    const completedQuizzes = await prisma.quiz.findMany({
      where: { userId: user.id, state: "COMPLETED", score: { not: null } },
      select: { quizTopic: true, score: true, createdAt: true, difficulty: true },
    });

    // Fetch study sessions to calculate actual duration
    const sessions = await prisma.studySession.findMany({
      where: { userId: user.id },
      select: { startTime: true, endTime: true }
    });
    
    const totalMinutes = Math.floor(sessions.reduce((acc, session) => {
        return acc + (session.endTime.getTime() - session.startTime.getTime()) / (1000 * 60);
    }, 0));

    // Calculate unique days active
    const activeDays = new Set(completedQuizzes.map(q => q.createdAt.toDateString())).size;

    // Calculate metrics
    const topicDifficultyScores = new Map<string, { score: number, difficulty: string }>();
    
    // Group by topic AND difficulty
    const proficiencyMap = new Map<string, Map<string, number>>(); // topic -> difficulty -> maxScore

    for (const quiz of completedQuizzes) {
      const topic = quiz.quizTopic.toLowerCase();
      const diff = quiz.difficulty ?? 'medium';
      
      if (!proficiencyMap.has(topic)) proficiencyMap.set(topic, new Map());
      const diffMap = proficiencyMap.get(topic)!;
      
      const currentMax = diffMap.get(diff) ?? 0;
      diffMap.set(diff, Math.max(currentMax, quiz.score ?? 0));
    }

    // Transform proficiencyMap for the UI: { "Topic (Difficulty)": score }
    const topicBreakdown: Record<string, number> = {};
    for (const [topic, diffMap] of proficiencyMap.entries()) {
        for (const [diff, score] of diffMap.entries()) {
            topicBreakdown[`${topic.charAt(0).toUpperCase() + topic.slice(1)} (${diff})`] = score;
        }
    }

    const totalQuizzes = completedQuizzes.length;
    // Calculate unique topics mastered (any difficulty)
    const completedTopics = proficiencyMap.size;
    
    // Calculate overall average
    const allScores = completedQuizzes.map(q => q.score ?? 0);
    const averageScore = allScores.length === 0 ? 0 : allScores.reduce((a, b) => a + b, 0) / allScores.length;

    // Update progress record
    const studyProgress = await prisma.studyProgress.upsert({
      where: { userId: user.id },
      update: { completedTopics, totalQuizzes, averageScore },
      create: { userId: user.id, completedTopics, totalQuizzes, averageScore },
    });

    // Generate insights
    const insights: string[] = [];
    if (completedQuizzes.length > 0) {
        // Flatten proficiencyMap to find overall topic performance
        const topicHighestScores = new Map<string, number>();
        for (const [topic, diffMap] of proficiencyMap.entries()) {
            let maxForTopic = 0;
            for (const score of diffMap.values()) {
                maxForTopic = Math.max(maxForTopic, score);
            }
            topicHighestScores.set(topic, maxForTopic);
        }

        const sortedTopics = Array.from(topicHighestScores.entries()).sort((a, b) => b[1] - a[1]);
        
        // Filter out topics with 100% mastery
        const needsReview = sortedTopics.filter(([, score]) => score < 100);
        const mastered = sortedTopics.filter(([, score]) => score === 100);

        if (mastered.length > 0) {
             insights.push(`You have completely mastered ${mastered.length > 1 ? 'topics like ' : ''}${mastered.map(t => t[0]).join(', ')}.`);
        }

        if (needsReview.length > 0) {
            const worst = needsReview[needsReview.length - 1];
            insights.push(`Consider reviewing ${worst[0]}, your current highest score is ${Math.round(worst[1])}%.`);
        } else if (mastered.length > 0) {
            insights.push("You've mastered everything! Time for a break or a new challenge.");
        }
    } else {
        insights.push("Start taking quizzes to see your study insights!");
    }

    // Return the progress with extra topic-specific data for the UI
    return {
        studyProgress: { ...studyProgress, activeDays, totalMinutes },
        topicBreakdown,
        insights
    };  
  });
}