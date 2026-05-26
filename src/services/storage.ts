import fs from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";

// We'll need uuid, let's install it too
export interface StorageService {
    uploadFile(file: Buffer, filename: string, mimeType: string): Promise<string>;
    deleteFile(fileUrl: string): Promise<void>;
}

export class LocalStorageService implements StorageService {
    private uploadDir: string;
    private baseUrl: string;

    constructor(baseUrl: string, uploadDir: string = "uploads") {
        this.uploadDir = uploadDir;
        this.baseUrl = baseUrl;
    }

    async init() {
        try {
            await fs.mkdir(this.uploadDir, { recursive: true });
        } catch (error) {
            console.error("Failed to create upload directory", error);
        }
    }

    async uploadFile(file: Buffer, filename: string, mimeType: string): Promise<string> {
        const ext = path.extname(filename);
        const uniqueName = `${uuidv4()}${ext}`;
        const filePath = path.join(this.uploadDir, uniqueName);
        
        await fs.writeFile(filePath, file);
        
        // Return relative URL for static serving
        return `/uploads/${uniqueName}`;
    }

    async deleteFile(fileUrl: string): Promise<void> {
        const filename = path.basename(fileUrl);
        const filePath = path.join(this.uploadDir, filename);
        try {
            await fs.unlink(filePath);
        } catch (error) {
            console.warn(`Failed to delete file: ${filePath}`, error);
        }
    }
}
