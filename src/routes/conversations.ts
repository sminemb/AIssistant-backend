import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createAssistantProvider } from "../assistant/provider.js";
import { prisma } from "../db/prisma.js";
import { parseBody, parseParams } from "../http/validation.js";

const createConversationSchema = z.object({
  title: z.string().trim().min(1).max(200),
});

const createMessageSchema = z.object({
  content: z.string().trim().min(1),
});

const conversationParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export async function conversationRoutes(app: FastifyInstance) {
  app.get("/conversations", async (request) => {
    const user = await app.requireUser(request);
    return prisma.conversation.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
    });
  });

  app.post("/conversations", async (request, reply) => {
    const user = await app.requireUser(request);
    const body = parseBody(request, createConversationSchema);
    
    // If the title is generic, we can potentially refine it later, 
    // but for now we ensure it's at least as specific as the user provided.
    const conversation = await prisma.conversation.create({
      data: {
        userId: user.id,
        title: body.title,
      },
    });

    await prisma.systemLog.create({
      data: { userId: user.id, action: `Started conversation: ${body.title}` }
    });

    return reply.status(201).send({ conversation });
  });

  app.delete("/conversations/:id", async (request) => {
    const user = await app.requireUser(request);
    const params = parseParams(request, conversationParamsSchema);
    
    await prisma.conversation.deleteMany({
      where: { id: params.id, userId: user.id },
    });

    await prisma.systemLog.create({
      data: { userId: user.id, action: `Deleted conversation: ${params.id}` }
    });
    
    return { success: true };
  });

  app.get("/conversations/:id/messages", async (request) => {
    const user = await app.requireUser(request);
    const params = parseParams(request, conversationParamsSchema);
    
    await prisma.systemLog.create({
      data: { userId: user.id, action: `Viewed conversation: ${params.id}` }
    });

    return prisma.message.findMany({
      where: { conversationId: params.id, conversation: { userId: user.id } },
      orderBy: { createdAt: "asc" },
    });
  });

  app.post("/conversations/:id/messages", async (request, reply) => {
    const user = await app.requireUser(request);
    const params = parseParams(request, conversationParamsSchema);
    const body = parseBody(request, createMessageSchema);

    // Verify conversation ownership and get history
    const conversation = await prisma.conversation.findFirstOrThrow({
      where: { id: params.id, userId: user.id },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });

    // 1. Save user message and update conversation's updatedAt
    await prisma.$transaction([
      prisma.message.create({
        data: {
          conversationId: conversation.id,
          role: "user",
          content: body.content,
        },
      }),
      prisma.conversation.update({
        where: { id: conversation.id },
        data: { 
            updatedAt: new Date(),
            title: conversation.title === "New Chat" ? body.content.substring(0, 50) : conversation.title 
        },
      }),
    ]);

    // 2. Prepare history for Assistant (last 10 messages)
    const history = conversation.messages.map(m => ({ role: m.role, content: m.content }));

    // 3. Call Assistant
    const assistantProvider = createAssistantProvider(app.config);
    let replyData: Awaited<ReturnType<typeof assistantProvider.answerStudyQuestion>>;
    
    try {
        replyData = await assistantProvider.answerStudyQuestion(body.content, history);
    } catch (error: any) {
        console.error("Assistant request failed:", error);
        const errorMessage = "I'm having trouble connecting to my study brain right now. Please try again in a little while.";
        const assistantMessage = await prisma.message.create({
            data: {
                conversationId: conversation.id,
                role: "assistant",
                content: errorMessage,
            },
        });
        return reply.status(200).send({ messages: [assistantMessage] });
    }

    // Append 'Take Quiz Now' if not present to trigger the frontend button. 
    // Now expecting format: "Take Quiz Now: X questions"
    let finalContent = replyData.content;
    if (!finalContent.toLowerCase().includes("take quiz now")) {
       finalContent += "\n\nWould you like to test your knowledge? Take Quiz Now!";
    }

    // 4. Save assistant message
    const assistantMessage = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "assistant",
        content: finalContent,
      },
    });

    // Extract count if present in the form "Take Quiz Now: X"
    const countMatch = finalContent.match(/take quiz now:?\s*(\d+)/i);
    const quizQuestionCount = countMatch ? parseInt(countMatch[1]) : 5;

    return reply.status(201).send({ 
        messages: [assistantMessage],
        meta: { suggestedQuizCount: quizQuestionCount } 
    });
  });
}
