import * as pdf from "pdf-parse";
import mammoth from "mammoth";
import Tesseract from "tesseract.js";

export async function extractTextFromFile(buffer: Buffer, mimeType: string): Promise<string> {
    console.log("DEBUG: Extracting text from file, mimeType:", mimeType);
    try {
        if (mimeType === "application/pdf") {
            const parser = (pdf as any).default || pdf;
            const data = await parser(buffer);
            console.log("DEBUG: PDF extraction success, chars:", data.text.length);
            return data.text;
        }

        if (mimeType.includes("wordprocessingml") || mimeType.includes("msword")) {
            const result = await mammoth.extractRawText({ buffer });
            console.log("DEBUG: Word extraction success, text length:", result.value.length);
            return result.value || "[File detected as Word Doc, but no readable text found]";
        }

        if (mimeType.startsWith("image/")) {
            console.log("DEBUG: Running OCR on image...");
            const { data: { text } } = await Tesseract.recognize(buffer, 'eng');
            console.log("DEBUG: OCR success, text length:", text.length);
            return text;
        }

        if (mimeType.includes("text/") || mimeType === "application/json" || mimeType === "text/csv") {
            const text = buffer.toString("utf-8");
            console.log("DEBUG: Text extraction success, chars:", text.length);
            return text;
        }

        return "[Unsupported file format for text extraction]";
    } catch (error) {
        console.error("DEBUG: Extraction failed:", error);
        return "[Error extracting text from file]";
    }
}
