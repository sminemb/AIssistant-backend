import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { buildAssistantContext } from "../assistant/context.js";
import { PlaceholderAssistantProvider } from "../assistant/provider.js";
import { prisma } from "../db/prisma.js";
import { assertCourseBelongsToStudent, parseDueInput } from "../domain/tasks.js";
import { HttpError } from "../http/errors.js";
import { parseBody, parseParams } from "../http/validation.js";

const assistantProvider = new PlaceholderAssistantProvider();

const conversationParamsSchema = z.object({ conversationId: z.string().uuid() });

const createConversationSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  courseId: z.string().uuid().nullable().optional(),
});

const createMessageSchema = z.object({
  content: z.string().trim().min(1).max(12000),
});

async function findOwnedConversation(studentId: string, conversationId: string) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, studentId, deletedAt: null },
  });

  if (!conversation) {
    throw new HttpError(404, "CONVERSATION_NOT_FOUND", "Conversation not found");
  }

  return conversation;
}

export async function conversationsRoutes(app: FastifyInstance) {
  app.get("/conversations", async (request) => {
    const student = await app.requireStudent(request);
    const conversations = await prisma.conversation.findMany({
      where: { studentId: student.id, deletedAt: null },
      include: {
        course: true,
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { updatedAt: "desc" },
    });

    return { conversations };
  });

  app.post("/conversations", async (request, reply) => {
    const student = await app.requireStudent(request);
    const body = parseBody(request, createConversationSchema);
    const courseId = body.courseId ?? null;

    await assertCourseBelongsToStudent(prisma, student.id, courseId);

    const conversation = await prisma.conversation.create({
      data: { studentId: student.id, courseId, title: body.title },
      include: { course: true },
    });

    return reply.status(201).send({ conversation });
  });

  app.get("/conversations/:conversationId", async (request) => {
    const student = await app.requireStudent(request);
    const params = parseParams(request, conversationParamsSchema);
    await findOwnedConversation(student.id, params.conversationId);

    const conversation = await prisma.conversation.findFirstOrThrow({
      where: { id: params.conversationId, studentId: student.id },
      include: {
        course: true,
        messages: { orderBy: { createdAt: "asc" } },
        suggestedTasks: { orderBy: { createdAt: "asc" }, include: { course: true, createdTask: true } },
      },
    });

    return { conversation };
  });

  app.delete("/conversations/:conversationId", async (request, reply) => {
    const student = await app.requireStudent(request);
    const params = parseParams(request, conversationParamsSchema);
    const conversation = await findOwnedConversation(student.id, params.conversationId);

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { deletedAt: new Date() },
    });

    return reply.status(204).send();
  });

  app.post("/conversations/:conversationId/messages", async (request, reply) => {
    const student = await app.requireStudent(request);
    const params = parseParams(request, conversationParamsSchema);
    const body = parseBody(request, createMessageSchema);
    const conversation = await findOwnedConversation(student.id, params.conversationId);

    const studentMessage = await prisma.message.create({
      data: {
        studentId: student.id,
        conversationId: conversation.id,
        author: "STUDENT",
        content: body.content,
      },
    });

    const context = await buildAssistantContext(prisma, student, conversation.id);
    const assistantReply = await assistantProvider.reply(body.content, context);

    const assistantMessage = await prisma.message.create({
      data: {
        studentId: student.id,
        conversationId: conversation.id,
        author: "ASSISTANT",
        content: assistantReply.content,
      },
    });

    const suggestedTasks = await Promise.all(
      assistantReply.suggestedTasks.map(async (suggestion) => {
        const courseId = suggestion.courseId ?? conversation.courseId ?? null;
        await assertCourseBelongsToStudent(prisma, student.id, courseId);
        const due = parseDueInput(suggestion, student.timezone);

        return prisma.suggestedTask.create({
          data: {
            studentId: student.id,
            conversationId: conversation.id,
            courseId,
            title: suggestion.title,
            notes: suggestion.notes,
            ...due,
          },
          include: { course: true },
        });
      }),
    );

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        updatedAt: new Date(),
        title: conversation.title ?? body.content.slice(0, 80),
      },
    });

    return reply.status(201).send({ studentMessage, assistantMessage, suggestedTasks });
  });
}
