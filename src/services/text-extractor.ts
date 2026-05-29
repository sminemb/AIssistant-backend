import * as pdf from "pdf-parse";
import mammoth from "mammoth";
import Tesseract from "tesseract.js";
import parsePptx from "pptx-text-parser";
import fs from "fs/promises";
import path from "path";
import os from "os";

export async function extractTextFromFile(buffer: Buffer, mimeType: string): Promise<string> {
    console.log(`[Extractor] Starting extraction for MIME type: ${mimeType}`);
    try {
        if (mimeType === "application/pdf") {
            try {
                // pdf-parse 2.4.5+ uses PDFParse class
                const parser = new (pdf as any).PDFParse({ data: buffer });
                const data = await parser.getText();
                const text = data.text?.trim() || "";
                console.log(`[Extractor] PDF extraction complete. Length: ${text.length} chars`);
                if (text.length === 0) {
                    return "[Note: This PDF appears to be a scan or contain no selectable text]";
                }
                return text;
            } catch (pdfError: any) {
                console.error("[Extractor] pdf-parse failed:", pdfError.message);
                return `[Error: Failed to parse PDF content: ${pdfError.message}]`;
            }
        }

        if (mimeType.includes("wordprocessingml") || mimeType.includes("msword")) {
            try {
                const result = await mammoth.extractRawText({ buffer });
                const text = result.value?.trim() || "";
                console.log(`[Extractor] Word extraction complete. Length: ${text.length} chars`);
                return text || "[Note: Word document contained no readable text]";
            } catch (wordError: any) {
                console.error("[Extractor] mammoth failed:", wordError.message);
                return `[Error: Failed to parse Word document: ${wordError.message}]`;
            }
        }

        if (mimeType.includes("presentationml")) {
            try {
                const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pptx-"));
                const tempFilePath = path.join(tempDir, "temp.pptx");
                await fs.writeFile(tempFilePath, buffer);
                
                const text = await parsePptx(tempFilePath, "text");
                await fs.rm(tempDir, { recursive: true, force: true });
                
                console.log(`[Extractor] PPTX extraction complete. Length: ${text.length} chars`);
                return text || "[Note: PPTX document contained no readable text]";
            } catch (pptxError: any) {
                console.error("[Extractor] pptx-text-parser failed:", pptxError.message);
                return `[Error: Failed to parse PPTX document: ${pptxError.message}]`;
            }
        }

        if (mimeType.startsWith("image/")) {
            try {
                console.log("[Extractor] Running OCR on image...");
                const { data: { text } } = await Tesseract.recognize(buffer, 'eng');
                const cleanedText = text?.trim() || "";
                console.log(`[Extractor] OCR complete. Length: ${cleanedText.length} chars`);
                return cleanedText || "[Note: Image contained no readable text]";
            } catch (ocrError: any) {
                console.error("[Extractor] Tesseract failed:", ocrError.message);
                return `[Error: OCR processing failed: ${ocrError.message}]`;
            }
        }

        if (mimeType.includes("text/") || mimeType === "application/json" || mimeType === "text/csv") {
            const text = buffer.toString("utf-8").trim();
            console.log(`[Extractor] Text extraction complete. Length: ${text.length} chars`);
            return text;
        }

        console.log(`[Extractor] Unsupported MIME type: ${mimeType}`);
        return `[Note: Extraction not supported for ${mimeType}]`;
    } catch (error: any) {
        console.error("[Extractor] Critical failure:", error);
        return `[Error: Critical extraction failure: ${error.message}]`;
    }
}
