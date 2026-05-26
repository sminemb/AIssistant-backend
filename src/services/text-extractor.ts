import * as pdf from "pdf-parse";
import mammoth from "mammoth";

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
            // Mammoth is good for simple text, but let's log if it fails
            const result = await mammoth.extractRawText({ buffer });
            console.log("DEBUG: Word extraction success, text length:", result.value.length);
            if (result.value.trim().length === 0) {
                 console.warn("DEBUG: Word doc extraction returned empty string. Possible complex formatting.");
            }
            return result.value || "[File detected as Word Doc, but no readable text found]";
        }

        if (mimeType === "text/plain") {
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
