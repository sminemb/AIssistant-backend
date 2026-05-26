import fs from "fs/promises";
import type { FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import { prisma } from "../db/prisma.js";
import { LocalStorageService } from "../services/storage.js";
import { HttpError } from "../assistant/provider.js";
import path from "path";
import { extractTextFromFile } from "../services/text-extractor.js";

const ALLOWED_MIME_TYPES = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
    "application/msword", // .doc
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
    "application/vnd.ms-excel", // .xls
    "application/vnd.openxmlformats-officedocument.presentationml.presentation", // .pptx
    "application/vnd.ms-powerpoint", // .ppt
    "text/plain",
    "audio/mpeg",
    "video/mp4",
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function attachmentRoutes(app: FastifyInstance) {
    // Register multipart with limits
    await app.register(multipart, {
        limits: {
            fileSize: MAX_FILE_SIZE,
        },
    });

    const port = process.env.PORT || "4000";
    const storage = new LocalStorageService(`http://localhost:${port}`);
    await storage.init();

    /**
     * GET /uploads/:filename
     * Serves uploaded files with appropriate security and CORS headers.
     */
    app.get("/uploads/:filename", async (request, reply) => {
        const { filename } = request.params as { filename: string };
        const filePath = path.join(process.cwd(), "uploads", filename);

        // Security: Prevent directory traversal
        if (filename.includes("..") || filename.startsWith("/")) {
            throw new HttpError(403, "FORBIDDEN", "Invalid file path");
        }

        try {
            const file = await fs.readFile(filePath);
            return reply
                .header("Content-Type", "application/octet-stream")
                .header("Access-Control-Allow-Origin", process.env.FRONTEND_URL || "http://localhost:3000")
                .send(file);
        } catch (error) {
            throw new HttpError(404, "NOT_FOUND", "File not found");
        }
    });

    /**
     * POST /attachments/upload
     */
    app.post("/attachments/upload", async (request, reply) => {
        const user = await app.requireUser(request);

        const data = await request.file();
        if (!data) {
            throw new HttpError(400, "NO_FILE", "No file uploaded");
        }

        if (!ALLOWED_MIME_TYPES.includes(data.mimetype)) {
            throw new HttpError(400, "INVALID_MIME_TYPE", `File type ${data.mimetype} not allowed`);
        }

        const buffer = await data.toBuffer();

        if (buffer.length > MAX_FILE_SIZE) {
            throw new HttpError(400, "FILE_TOO_LARGE", "Maximum file size is 10MB");
        }

        const originalName = data.filename;
        const sanitizedName = originalName.replace(/[^a-zA-Z0-9.\-_]/g, "_");

        const fileUrl = await storage.uploadFile(buffer, sanitizedName, data.mimetype);

        // Extract text for AI scanning
        const extractedText = await extractTextFromFile(buffer, data.mimetype);

        return {
            url: fileUrl,
            originalName,
            mimeType: data.mimetype,
            size: buffer.length,
            extractedText
        };
    });
}
