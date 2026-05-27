import fs from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { v2 as cloudinary } from "cloudinary";

export interface StorageService {
    uploadFile(file: Buffer, filename: string, mimeType: string): Promise<string>;
    deleteFile(fileUrl: string): Promise<void>;
}

export class CloudinaryStorageService implements StorageService {
    constructor() {}

    async uploadFile(file: Buffer, filename: string, mimeType: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                {
                    folder: "aissistant_uploads",
                    resource_type: "auto",
                    public_id: path.parse(filename).name + "_" + uuidv4().slice(0, 8),
                },
                (error, result) => {
                    if (error) {
                        console.error("Cloudinary upload failed:", error);
                        return reject(error);
                    }
                    if (!result) return reject(new Error("Cloudinary upload failed: No result"));
                    resolve(result.secure_url);
                }
            );
            uploadStream.end(file);
        });
    }

    async deleteFile(fileUrl: string): Promise<void> {
        // Extract public_id from URL
        const parts = fileUrl.split("/");
        const filename = parts[parts.length - 1];
        const publicId = "aissistant_uploads/" + path.parse(filename).name;
        
        try {
            await cloudinary.uploader.destroy(publicId);
        } catch (error) {
            console.warn(`Failed to delete Cloudinary file: ${publicId}`, error);
        }
    }
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
