import type { Prisma, Quiz, QuizAnswer, QuizOption, QuizQuestion } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { createAssistantProvider } from "../assistant/provider.js";
import { prisma } from "../db/prisma.js";
import { HttpError } from "../http/errors.js";
import { parseBody, parseParams } from "../http/validation.js";

const quizParamsSchema = z.object({ quizId: z.coerce.number().int().positive() });

const createQuizSchema = z.object({
  quizTopic: z.string().trim().min(1).max(200),
  questionCount: z.union([z.number().int().min(1).max(10), z.string().transform(Number)]).optional().default(5),
});

const submitQuizSchema = z.object({
  answers: z
    .array(
      z.object({
        quizQuestionId: z.number().int().positive(),
        selectedOptionId: z.number().int().positive(),
      }),
    )
    .min(1)
    .max(10),
});

type QuizWithQuestions = Quiz & {
  questions: Array<QuizQuestion & { options: QuizOption[]; answer: QuizAnswer | null }>;
};

function quizDto(quiz: QuizWithQuestions, includeCorrectness: boolean) {
  return {
    id: quiz.id,
    userId: quiz.userId,
    quizTopic: quiz.quizTopic,
    score: quiz.score,
    state: quiz.state,
    createdAt: quiz.createdAt,
    updatedAt: quiz.updatedAt,
    questions: quiz.questions
      .sort((left, right) => left.position - right.position)
      .map((question) => ({
        id: question.id,
        quizId: question.quizId,
        questionText: question.questionText,
        position: question.position,
        selectedOptionId: question.answer?.selectedOptionId ?? null,
        isCorrect: includeCorrectness ? question.answer?.isCorrect ?? null : undefined,
        options: question.options
          .sort((left, right) => left.position - right.position)
          .map((option) => ({
            id: option.id,
            quizQuestionId: option.quizQuestionId,
            optionText: option.optionText,
            position: option.position,
            isCorrect: includeCorrectness ? option.isCorrect : undefined,
          })),
      })),
  };
}

async function findOwnedQuiz(userId: number, quizId: number, tx: Prisma.TransactionClient = prisma) {
  const quiz = await tx.quiz.findFirst({
    where: { id: quizId, userId },
    include: {
      questions: {
        include: {
          options: true,
          answer: true,
        },
      },
    },
  });

  if (!quiz) {
    throw new HttpError(404, "QUIZ_NOT_FOUND", "Quiz not found");
  }

  return quiz;
}

async function refreshStudyProgress(tx: Prisma.TransactionClient, userId: number) {
  const completedQuizzes = await tx.quiz.findMany({
    where: { userId, state: "COMPLETED", score: { not: null } },
    select: { quizTopic: true, score: true },
  });
  const totalQuizzes = completedQuizzes.length;
  const completedTopics = new Set(completedQuizzes.map((quiz) => quiz.quizTopic.toLowerCase())).size;
  const averageScore =
    totalQuizzes === 0
      ? 0
      : completedQuizzes.reduce((total, quiz) => total + (quiz.score ?? 0), 0) / totalQuizzes;

  return tx.studyProgress.upsert({
    where: { userId },
    update: { completedTopics, totalQuizzes, averageScore },
    create: { userId, completedTopics, totalQuizzes, averageScore },
  });
}

export async function quizzesRoutes(app: FastifyInstance) {
  app.get("/quizzes", async (request) => {
    const user = await app.requireUser(request);
    const quizzes = await prisma.quiz.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });

    return { quizzes };
  });

  app.post("/quizzes", async (request, reply) => {
    const user = await app.requireUser(request);
    const body = parseBody(request, createQuizSchema);
    const assistantProvider = createAssistantProvider(app.config);
    const generatedQuiz = await assistantProvider.generateQuiz(body.quizTopic, body.questionCount);

    const quiz = await prisma.quiz.create({
      data: {
        userId: user.id,
        quizTopic: body.quizTopic,
        questions: {
          create: generatedQuiz.questions.map((question, questionIndex) => ({
            questionText: question.questionText,
            position: questionIndex + 1,
            options: {
              create: question.options.map((optionText, optionIndex) => ({
                optionText,
                position: optionIndex + 1,
                isCorrect: optionIndex === question.correctOptionIndex,
              })),
            },
          })),
        },
      },
      include: { questions: { include: { options: true, answer: true } } },
    });

    return reply.status(201).send({ quiz: quizDto(quiz, false) });
  });

  app.delete("/quizzes/:quizId", async (request) => {
    const user = await app.requireUser(request);
    const params = parseParams(request, quizParamsSchema);
    
    await prisma.quiz.deleteMany({
      where: { id: params.quizId, userId: user.id },
    });
    
    return { success: true };
  });

  app.get("/quizzes/:quizId", async (request) => {
    const user = await app.requireUser(request);
    const params = parseParams(request, quizParamsSchema);
    const quiz = await findOwnedQuiz(user.id, params.quizId);

    return { quiz: quizDto(quiz, quiz.state === "COMPLETED") };
  });

  app.post("/quizzes/:quizId/submit", async (request) => {
    const user = await app.requireUser(request);
    const params = parseParams(request, quizParamsSchema);
    const body = parseBody(request, submitQuizSchema);

    const result = await prisma.$transaction(async (tx) => {
      const quiz = await findOwnedQuiz(user.id, params.quizId, tx);

      if (quiz.state === "COMPLETED") {
        throw new HttpError(409, "QUIZ_ALREADY_COMPLETED", "Completed Quizzes cannot be submitted again");
      }

      if (body.answers.length !== quiz.questions.length) {
        throw new HttpError(400, "QUIZ_INCOMPLETE", "Submit one answer for every Quiz Question");
      }

      const answersByQuestion = new Map(body.answers.map((answer) => [answer.quizQuestionId, answer.selectedOptionId]));
      if (answersByQuestion.size !== quiz.questions.length) {
        throw new HttpError(400, "QUIZ_INCOMPLETE", "Submit one answer for every Quiz Question");
      }

      let correctAnswers = 0;

      for (const question of quiz.questions) {
        const selectedOptionId = answersByQuestion.get(question.id);
        const selectedOption = question.options.find((option) => option.id === selectedOptionId);

        if (!selectedOption) {
          throw new HttpError(400, "QUIZ_OPTION_INVALID", "Selected Quiz Option does not belong to its Quiz Question");
        }

        if (selectedOption.isCorrect) {
          correctAnswers += 1;
        }

        await tx.quizAnswer.create({
          data: {
            quizId: quiz.id,
            quizQuestionId: question.id,
            selectedOptionId: selectedOption.id,
            isCorrect: selectedOption.isCorrect,
          },
        });
      }

      const score = (correctAnswers / quiz.questions.length) * 100;
      await tx.quiz.update({
        where: { id: quiz.id },
        data: { state: "COMPLETED", score },
      });
      const studyProgress = await refreshStudyProgress(tx, user.id);
      const completedQuiz = await findOwnedQuiz(user.id, quiz.id, tx);

      return { quiz: quizDto(completedQuiz, true), studyProgress };
    });

    return result;
  });
}