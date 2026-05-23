import type { FastifyInstance } from "fastify";

import { prisma } from "../db/prisma.js";

export async function dashboardRoutes(app: FastifyInstance) {
  app.get("/dashboard/summary", async (request) => {
    const student = await app.requireStudent(request);
    const [recentStudyQuestions, recentQuizzes, studyProgress] = await Promise.all([
      prisma.studyQuestion.findMany({
        where: { studentId: student.id },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      prisma.quiz.findMany({
        where: { studentId: student.id },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      prisma.studyProgress.upsert({
        where: { studentId: student.id },
        update: {},
        create: { studentId: student.id },
      }),
    ]);

    return {
      recentStudyQuestions,
      recentQuizzes,
      studyProgress,
    };
  });
}
