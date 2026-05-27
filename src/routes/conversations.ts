import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createAssistantProvider } from "../assistant/provider.js";
import { prisma } from "../db/prisma.js";
import { parseBody, parseParams } from "../http/validation.js";

const createConversationSchema = z.object({
  title: z.string().trim().min(1).max(200),
});

const createMessageSchema = z.object({
  content: z.string().trim().min(0),
  searchMode: z.boolean().optional(),
  attachments: z.array(z.object({
      name: z.string(),
      type: z.string(),
      url: z.string().optional(),
      size: z.number().optional(),
      extractedText: z.string().optional(),
  })).optional(),
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
      include: { attachments: true },
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
      include: { 
          messages: { 
              orderBy: { createdAt: "asc" },
              include: { attachments: true }
          } 
      },
    });

    // 1. Save user message (metadata only) and update conversation's updatedAt
    const userMessage = await prisma.$transaction(async (tx) => {
      const msg = await tx.message.create({
        data: {
          conversationId: conversation.id,
          role: "user",
          content: body.content,
        },
      });

      if (body.attachments && body.attachments.length > 0) {
        await tx.attachment.createMany({
          data: body.attachments.map((att: any) => ({
            messageId: msg.id,
            userId: user.id,
            originalName: att.name,
            fileUrl: att.url || "",
            mimeType: att.type,
            size: att.size || 0,
            extractedText: att.extractedText || null,
          })),
        });
      }

      await tx.conversation.update({
        where: { id: conversation.id },
        data: { 
            updatedAt: new Date(),
            title: conversation.title === "New Chat" ? (body.content.substring(0, 50) || (body.attachments?.[0]?.name ?? "New Chat")) : conversation.title 
        },
      });

      return tx.message.findUnique({
          where: { id: msg.id },
          include: { attachments: true }
      });
    });

    // 2. Prepare history for Assistant (last 10 messages)
    // We include history and append attachment info to the content for historical context
    const history = conversation.messages.slice(-10).map(m => {
        let content = m.content;
        if (m.attachments && m.attachments.length > 0) {
            const attachmentInfo = m.attachments
                .map(a => `[Attachment: ${a.originalName}${a.extractedText ? ` - Content: ${a.extractedText.slice(0, 4000)}...` : ''}]`)
                .join('\n');
            content = `${content}\n${attachmentInfo}`;
        }
        return { role: m.role, content };
    });

    // 3. Call Assistant (pass full attachments with data if they have scanning data)
    const assistantProvider = createAssistantProvider(app.config);
    
    // Explicitly pass attachments with extractedText and URL
    const attachmentsForAI = body.attachments?.map((att: any) => ({
        name: att.name,
        type: att.type,
        extractedText: att.extractedText,
        url: att.url
    }));

    console.log(`[Assistant] Sending Turn: "${body.content.slice(0, 50)}..." with ${attachmentsForAI?.length || 0} attachments`);
    if (attachmentsForAI?.length) {
        attachmentsForAI.forEach((a: any, i: number) => {
            console.log(`[Assistant] Attachment ${i+1}: ${a.name} (${a.type}), text size: ${a.extractedText?.length || 0}`);
        });
    }

    let replyData: Awaited<ReturnType<typeof assistantProvider.answerStudyQuestion>>;
    
    try {
        replyData = await assistantProvider.answerStudyQuestion(body.content, history, body.searchMode, attachmentsForAI as any);
    } catch (error: any) {
        console.error("Assistant request failed:", error);
        const errorMessage = "I'm having trouble connecting to my study brain right now. Please try again in a little while.";
        const assistantMessage = await prisma.message.create({
            data: {
                conversationId: conversation.id,
                role: "assistant",
                content: errorMessage,
            },
            include: { attachments: true }
        });
        return reply.status(200).send({ messages: [assistantMessage] });
    }

    // 4. Save assistant message
    const assistantMessage = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "assistant",
        content: replyData.content,
      },
      include: { attachments: true }
    });

    return reply.status(201).send({ messages: [assistantMessage] });
  });
}
