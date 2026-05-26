import type { FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import { prisma } from "../db/prisma.js";
import { LocalStorageService } from "../services/storage.js";
import { HttpError } from "../assistant/provider.js";
import path from "path";

const ALLOWED_MIME_TYPES = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
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
     * POST /attachments/upload
     * Securely handles file uploads, validates size and MIME type,
     * and stores the file in the configured storage service.
     */
    app.post("/attachments/upload", async (request, reply) => {
        const user = await app.requireUser(request);
        
        // request.file() is provided by @fastify/multipart
        const data = await request.file();
        if (!data) {
            throw new HttpError(400, "NO_FILE", "No file uploaded");
        }

        // Validate allowed file types
        if (!ALLOWED_MIME_TYPES.includes(data.mimetype)) {
            throw new HttpError(400, "INVALID_MIME_TYPE", `File type ${data.mimetype} not allowed`);
        }

        const buffer = await data.toBuffer();
        
        // Security: Prevent extremely large files that pass through basic checks
        if (buffer.length > MAX_FILE_SIZE) {
            throw new HttpError(400, "FILE_TOO_LARGE", "Maximum file size is 10MB");
        }

        // Security: Sanitize filename to prevent path traversal or dangerous characters
        const originalName = data.filename;
        const sanitizedName = originalName.replace(/[^a-zA-Z0-9.\-_]/g, "_");
        
        // Store the file and get its public URL
        const fileUrl = await storage.uploadFile(buffer, sanitizedName, data.mimetype);

        // Metadata returned to frontend to be saved when the message is sent
        return {
            url: fileUrl,
            originalName,
            mimeType: data.mimetype,
            size: buffer.length,
        };
    });
}
