import type { FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import { prisma } from "../db/prisma.js";
import { CloudinaryStorageService } from "../services/storage.js";
import { HttpError } from "../assistant/provider.js";
import { extractTextFromFile } from "../services/text-extractor.js";
import fs from "fs/promises";
import path from "path";

const ALLOWED_MIME_TYPES = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
    "application/msword", // .doc
    "text/plain",
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function attachmentRoutes(app: FastifyInstance) {
    // Register multipart with limits
    await app.register(multipart, {
        limits: {
            fileSize: MAX_FILE_SIZE,
        },
    });

    const storage = new CloudinaryStorageService();

    /**
     * GET /uploads/:filename (Legacy Support)
     */
    app.get("/uploads/:filename", async (request, reply) => {
        const { filename } = request.params as { filename: string };
        const filePath = path.join(process.cwd(), "uploads", filename);

        if (filename.includes("..") || filename.startsWith("/")) {
            throw new HttpError(403, "FORBIDDEN", "Invalid file path");
        }

        try {
            const file = await fs.readFile(filePath);
            return reply
                .header("Content-Type", "application/octet-stream")
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

        try {
            console.log(`[Upload] Starting upload for ${sanitizedName} (${data.mimetype})...`);
            const fileUrl = await storage.uploadFile(buffer, sanitizedName, data.mimetype);
            console.log(`[Upload] Successfully uploaded to: ${fileUrl}`);

            // Extract text for AI scanning (don't fail the whole upload if this fails)
            let extractedText = "";
            try {
                extractedText = await extractTextFromFile(buffer, data.mimetype);
            } catch (extError) {
                console.warn("[Upload] Text extraction failed, but continuing upload:", extError);
            }

            return {
                url: fileUrl,
                originalName,
                mimeType: data.mimetype,
                size: buffer.length,
                extractedText
            };
        } catch (error: any) {
            console.error("[Upload] Critical failure:", error);
            throw new HttpError(500, "UPLOAD_FAILED", error.message || "Failed to upload file to storage");
        }
    });
}
