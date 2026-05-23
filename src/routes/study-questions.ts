import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { createAssistantProvider } from "../assistant/provider.js";
import { prisma } from "../db/prisma.js";
import { parseBody } from "../http/validation.js";

const createStudyQuestionSchema = z.object({
  questionText: z.string().trim().min(1).max(12000),
});

export async function studyQuestionsRoutes(app: FastifyInstance) {
  app.get("/study-questions", async (request) => {
    const student = await app.requireStudent(request);
    const studyQuestions = await prisma.studyQuestion.findMany({
      where: { studentId: student.id },
      orderBy: { createdAt: "desc" },
    });

    return { studyQuestions };
  });

  app.post("/study-questions", async (request, reply) => {
    const student = await app.requireStudent(request);
    const body = parseBody(request, createStudyQuestionSchema);
    const assistantProvider = createAssistantProvider(app.config);
    const assistantReply = await assistantProvider.answerStudyQuestion(body.questionText);

    const studyQuestion = await prisma.studyQuestion.create({
      data: {
        studentId: student.id,
        questionText: body.questionText,
        chatbotResponse: assistantReply.content,
      },
    });

    return reply.status(201).send({ studyQuestion });
  });
}
