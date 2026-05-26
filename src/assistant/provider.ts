const GEMINI_MODELS = [
   "gemini-3.1-pro-preview",
   "gemini-3-flash-preview",
   "gemini-3.1-flash-lite-preview",
   "gemini-2.5-pro",
   "gemini-2.5-flash",
   "gemini-2.5-flash-lite",
] as const;

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

export type StudyQuestionReply = {
   content: string;
};

export type GeneratedQuizQuestion = {
   questionText: string;
   options: string[];
   correctOptionIndex: number;
};

export type GeneratedQuiz = {
   questions: GeneratedQuizQuestion[];
};

export interface AssistantProvider {
   answerStudyQuestion(
      questionText: string,
      history?: Array<{ role: string; content: string }>,
      searchMode?: boolean,
      attachments?: Array<{ name: string; type: string; extractedText?: string }>,
   ): Promise<StudyQuestionReply>;

   generateQuiz(
      quizTopic: string,
      questionCount: number,
      attachments?: Array<{ name: string; type: string; extractedText?: string }>,
   ): Promise<GeneratedQuiz>;
}

type AssistantProviderEnv = {
   NODE_ENV: "development" | "test" | "production";
   GEMINI_API_KEY?: string;
   GEMINI_MODEL?: string;
};

type Fetch = typeof fetch;

export class HttpError extends Error {
   constructor(
      public status: number,
      public code: string,
      message: string,
   ) {
      super(message);
      this.name = "HttpError";
   }
}

function parseStudyQuestionReply(text: string): StudyQuestionReply {
   try {
      const data = JSON.parse(text);

      if (data?.content) {
         return {
            content: data.content,
         };
      }
   } catch {
      // ignore JSON parsing errors
   }

   return {
      content: text || "I could not produce a study response right now.",
   };
}

function parseGeneratedQuiz(
   text: string,
   questionCount: number,
): GeneratedQuiz {
   try {
      const parsed = JSON.parse(text);

      if (
         parsed &&
         Array.isArray(parsed.questions) &&
         parsed.questions.length === questionCount
      ) {
         return parsed;
      }
   } catch {
      // ignore parsing errors
   }

   throw new HttpError(
      502,
      "ASSISTANT_PROVIDER_INVALID_RESPONSE",
      "AI Study Assistant provider returned invalid quiz data",
   );
}

class MissingAssistantProvider implements AssistantProvider {
   async answerStudyQuestion(): Promise<StudyQuestionReply> {
      throw new HttpError(
         503,
         "ASSISTANT_PROVIDER_NOT_CONFIGURED",
         "AI Study Assistant provider is not configured",
      );
   }

   async generateQuiz(): Promise<GeneratedQuiz> {
      throw new HttpError(
         503,
         "ASSISTANT_PROVIDER_NOT_CONFIGURED",
         "AI Study Assistant provider is not configured",
      );
   }
}

export class GeminiAssistantProvider implements AssistantProvider {
   constructor(
      private readonly apiKey: string,
      private readonly modelsToTry: string[],
      private readonly fetchImpl: Fetch = globalThis.fetch,
   ) {
      if (modelsToTry.length === 0) {
         throw new Error(
            "GeminiAssistantProvider requires at least one model.",
         );
      }
   }

   private async request(
      systemPrompt: string,
      payload: any,
      retryCount: number = 3,
   ): Promise<string> {
      const geminiApiUrl =
         "https://generativelanguage.googleapis.com/v1beta/models/";

      let lastError: unknown;

      for (let attempt = 0; attempt < retryCount; attempt++) {
         for (const model of this.modelsToTry) {
            try {
               console.log(`Trying Gemini model: ${model} (Attempt ${attempt + 1})`);

               const url = `${geminiApiUrl}${model}:generateContent?key=${this.apiKey}`;

               // Add system_instruction to payload if not already there
               const body = {
                   ...payload,
                   system_instruction: { parts: [{ text: systemPrompt }] }
               };

               const response = await this.fetchImpl(url, {
                  method: "POST",
                  headers: {
                     "Content-Type": "application/json",
                  },
                  body: JSON.stringify(body),
               });

               const responseData = await response.json();

               if (!response.ok) {
                  console.error(
                     `Gemini API Error with model ${model}:`,
                     JSON.stringify(responseData, null, 2),
                  );

                  lastError = responseData;
                  
                  if (response.status === 429) {
                     throw new HttpError(429, "QUOTA_EXCEEDED", "Daily request limit reached.");
                  }

                  if (response.status >= 400 && response.status < 500) {
                      throw new HttpError(response.status, "GEMINI_API_ERROR", JSON.stringify(responseData));
                  }
                  continue; 
               }

               const text =
                  responseData?.candidates?.[0]?.content?.parts?.[0]?.text;

               if (text) {
                  return text;
               }

               lastError = responseData;
            } catch (error) {
               console.error(`Gemini request failed for model ${model}:`, error);
               lastError = error;
            }
         }
         const delay = Math.pow(2, attempt) * 1000;
         await new Promise(resolve => setTimeout(resolve, delay));
      }

      throw new HttpError(
         502,
         "ASSISTANT_PROVIDER_FAILED",
         `AI Study Assistant provider request failed.`,
      );
   }

   private getFileInstruction(fileName: string, type: string): string {
      const ext = fileName.split('.').pop()?.toLowerCase() || '';
      
      if (type.startsWith('image/')) {
          return "- You are analyzing an IMAGE. Describe the visual elements, transcribe any text (OCR), and explain the context.";
      }
      if (ext === 'pdf' || type.includes('word')) {
          return "- You are analyzing a DOCUMENT/PDF. Extract key arguments, summarize main takeaways, and provide a structured overview.";
      }
      if (type.includes('excel') || type.includes('spreadsheet')) {
          return "- You are analyzing a SPREADSHEET/DATA. Identify main trends, anomalies, and summary statistics.";
      }
      if (['js', 'py', 'ts', 'java', 'c', 'cpp'].includes(ext)) {
          return "- You are analyzing CODE. Review for bugs, security vulnerabilities, or optimization opportunities.";
      }
      return "- Analyze this file thoroughly and provide relevant insights.";
   }

   async answerStudyQuestion(
      questionText: string,
      history: Array<{ role: string; content: string }> = [],
      searchMode: boolean = false,
      attachments?: Array<{ name: string; type: string; extractedText?: string; url?: string }>,
   ): Promise<StudyQuestionReply> {
      let systemPrompt = `
You are a helpful AI study assistant.
- Carefully analyze all attached files (documents, images, data sheets).
- Answer questions accurately based ONLY on the details provided in the file.
- If the user asks a question, answer using only verified facts from the attachments.
- Keep responses concise, structured, and easy to read.
- If the user's prompt is generic or empty, provide a clean, 3-bullet point summary of the file.
- If quiz generation is contextually appropriate, append the hidden tag [[GENERATE_QUIZ]] at the end.
`;

      const parts: any[] = [{ text: systemPrompt + `\n\nUser request: ${questionText}\nHistory: ${JSON.stringify(history)}` }];

      if (attachments && attachments.length > 0) {
         for (const att of attachments) {
             if (att.url) {
                try {
                    // Fetch image from UploadThing URL
                    const response = await fetch(att.url);
                    const arrayBuffer = await response.arrayBuffer();
                    const base64Data = Buffer.from(arrayBuffer).toString("base64");
                    
                    parts.push({
                        inline_data: {
                            mime_type: att.type,
                            data: base64Data
                        }
                    });
                } catch (e) {
                    console.error("Failed to fetch image from UploadThing:", e);
                    parts.push({ text: `\n--- FILE: ${att.name} ---\n[Failed to load image for analysis]` });
                }
             } else if (att.extractedText) {
                parts.push({ text: `\n--- FILE: ${att.name} ---\n${att.extractedText}\n` });
             }
         }
      }

      const response = await this.request(systemPrompt, { contents: [{ parts }] });
      return parseStudyQuestionReply(response);
   }

   async generateQuiz(
      quizTopic: string,
      questionCount: number,
      attachments?: Array<{ name: string; type: string; extractedText?: string }>,
   ): Promise<GeneratedQuiz> {
      let systemPrompt = `
You are a quiz generator.

Return ONLY valid JSON using this exact format:

{
  "questions": [
    {
      "questionText": "Question?",
      "options": ["A", "B", "C", "D"],
      "correctOptionIndex": 0
    }
  ]
}

Rules:
- Generate exactly ${questionCount} questions
- Exactly 4 options per question
- correctOptionIndex must be 0-3
- No markdown
- No explanations
`;

      if (attachments && attachments.length > 0) {
          systemPrompt += `
CONTEXT PROVIDED FROM ATTACHMENTS:
- You MUST use the following extracted text to generate the quiz content:
${attachments.map(a => `\n--- CONTENT FROM ${a.name} ---
${a.extractedText || "[No text content extracted]"}`).join('\n')}
`;
      }

      const responseText = await this.request(systemPrompt, {
         topic: quizTopic,
         questionCount,
      });

      return parseGeneratedQuiz(responseText, questionCount);
   }
}

export function createAssistantProvider(
   env: AssistantProviderEnv,
   fetchImpl?: Fetch,
): AssistantProvider {
   if (env.GEMINI_API_KEY) {
      const preferredModel = env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL;

      const modelsToTry: string[] = [];

      if (GEMINI_MODELS.includes(preferredModel as any)) {
         modelsToTry.push(preferredModel);
      } else {
         console.warn(
            `Unknown GEMINI_MODEL "${preferredModel}". Falling back to ${DEFAULT_GEMINI_MODEL}`,
         );

         modelsToTry.push(DEFAULT_GEMINI_MODEL);
      }

      for (const model of GEMINI_MODELS) {
         if (!modelsToTry.includes(model)) {
            modelsToTry.push(model);
         }
      }

      return new GeminiAssistantProvider(
         env.GEMINI_API_KEY,
         modelsToTry,
         fetchImpl,
      );
   }

   if (env.NODE_ENV === "production") {
      return new MissingAssistantProvider();
   }

   return new PlaceholderAssistantProvider();
}

export class PlaceholderAssistantProvider implements AssistantProvider {
   async answerStudyQuestion(
      questionText: string,
   ): Promise<StudyQuestionReply> {
      return {
         content: `Study answer: ${questionText}`,
      };
   }

   async generateQuiz(
      quizTopic: string,
      questionCount: number,
   ): Promise<GeneratedQuiz> {
      return {
         questions: Array.from({ length: questionCount }, (_, index) => ({
            questionText: `${quizTopic} practice question ${index + 1}`,
            options: ["Option A", "Option B", "Option C", "Option D"],
            correctOptionIndex: index % 4,
         })),
      };
   }
}
