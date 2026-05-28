import type { FastifyInstance } from "fastify";
import { prisma } from "../db/prisma.js";
import { z } from "zod";
import { HttpError } from "../assistant/provider.js";

export async function sessionRoutes(app: FastifyInstance) {
    app.post("/sessions/start", async (request) => {
        const user = await app.requireUser(request);
        // Record session start
        const session = await prisma.studySession.create({
            data: {
                userId: user.id,
                startTime: new Date(),
                endTime: new Date(), // Temporary, updated at end
            }
        });
        return { sessionId: session.id };
    });

    app.post("/sessions/heartbeat", async (request) => {
        const user = await app.requireUser(request);
        const { sessionId } = z.object({ sessionId: z.number() }).parse(request.body);

        await prisma.studySession.update({
            where: { id: sessionId, userId: user.id },
            data: { endTime: new Date() }
        });
        return { success: true };
    });

    app.post("/sessions/end", async (request) => {
        const user = await app.requireUser(request);
        const { sessionId } = z.object({ sessionId: z.number() }).parse(request.body);

        const session = await prisma.studySession.update({
            where: { id: sessionId, userId: user.id },
            data: { endTime: new Date() }
        });
        return { success: true };
    });
}
