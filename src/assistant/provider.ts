import { z } from "zod";

const GEMINI_MODELS = [
   "gemini-3.5-flash",
   "gemini-3.1-flash-lite",
   "gemini-3.1-flash-lite-preview",
   "gemini-3.1-flash-live-preview",
   "gemini-3.1-pro-preview",
   "gemini-3-flash-preview",
   "gemini-3.1-flash-lite-preview",
   "gemini-2.5-pro",
   "gemini-2.5-flash",
   "gemini-2.5-flash-lite",
] as const;

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

const GEMINI_API_BASE_URL =
   "https://generativelanguage.googleapis.com/v1beta/models/";

const REQUEST_TIMEOUT_MS = 30000;
const MAX_RETRIES = 3;
const MAX_ATTACHMENT_CHARS = 15000;
const MAX_HISTORY_MESSAGES = 10;

const RETRYABLE_STATUS_CODES = [429, 500, 502, 503, 504];

const ALLOWED_ATTACHMENT_HOSTS = ["utfs.io", "uploadthing.com"];

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
      attachments?: Array<{
         name: string;
         type: string;
         extractedText?: string;
         url?: string;
      }>,
   ): Promise<StudyQuestionReply>;

   generateQuiz(
      quizTopic: string,
      questionCount: number,
      attachments?: Array<{
         name: string;
         type: string;
         extractedText?: string;
      }>,
   ): Promise<GeneratedQuiz>;
}

type AssistantProviderEnv = {
   NODE_ENV: "development" | "test" | "production";
   GEMINI_API_KEY?: string;
   GEMINI_MODEL?: string;
};

type Fetch = typeof fetch;

const QuizSchema = z.object({
   questions: z.array(
      z.object({
         questionText: z.string().min(5),
         options: z.array(z.string()).length(4),
         correctOptionIndex: z.number().min(0).max(3),
      }),
   ),
});

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

function sanitizeText(text: string): string {
   return text
      .replace(/```[\s\S]*?```/g, "")
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
      .trim();
}

function truncateText(text: string, limit: number): string {
   return text.length > limit ? text.slice(0, limit) : text;
}

function cleanJsonResponse(text: string): string {
   return text
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();
}

function formatHistory(
   history: Array<{ role: string; content: string }>,
): string {
   return history
      .slice(-MAX_HISTORY_MESSAGES)
      .map(
         (msg) =>
            `${msg.role.toUpperCase()}: ${truncateText(msg.content, 1000)}`,
      )
      .join("\n");
}

function parseStudyQuestionReply(text: string): StudyQuestionReply {
   const cleaned = text.trim();

   // If it looks like a JSON object (starts with {), try to parse it
   if (cleaned.startsWith("{")) {
       try {
          const data = JSON.parse(cleaned);
          if (typeof data?.content === "string") {
             return { content: data.content };
          }
       } catch {
          // If JSON parse fails, treat as plain Markdown
       }
   }

   return {
      content: cleaned || "I could not produce a study response right now.",
   };
}

function parseGeneratedQuiz(
   text: string,
   questionCount: number,
): GeneratedQuiz {
   try {
      const cleaned = cleanJsonResponse(text);

      const parsed = JSON.parse(cleaned);

      const validated = QuizSchema.parse(parsed);

      if (validated.questions.length !== questionCount) {
         throw new Error("Incorrect number of questions returned");
      }

      return validated;
   } catch (error) {
      console.error("Quiz validation failed:", error);

      throw new HttpError(
         502,
         "ASSISTANT_PROVIDER_INVALID_RESPONSE",
         "AI Study Assistant provider returned invalid quiz data",
      );
   }
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

   private async fetchAttachmentAsBase64(url: string): Promise<string | null> {
      try {
         const parsedUrl = new URL(url);

         if (
            !ALLOWED_ATTACHMENT_HOSTS.some((host) =>
               parsedUrl.hostname.includes(host),
            )
         ) {
            throw new Error("Untrusted attachment host");
         }

         const response = await this.fetchImpl(url);

         if (!response.ok) {
            throw new Error("Failed to fetch attachment");
         }

         const arrayBuffer = await response.arrayBuffer();

         return Buffer.from(arrayBuffer).toString("base64");
      } catch (error) {
         console.error("Attachment fetch failed:", error);

         return null;
      }
   }

   private async request(
      systemPrompt: string,
      contents: any[],
      generationConfig?: Record<string, unknown>,
   ): Promise<string> {
      let lastError: unknown;

      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
         for (const model of this.modelsToTry) {
            const controller = new AbortController();

            const timeout = setTimeout(() => {
               controller.abort();
            }, REQUEST_TIMEOUT_MS);

            try {
               console.log(
                  `[Gemini] Trying model ${model} (Attempt ${attempt + 1})`,
               );

               const response = await this.fetchImpl(
                  `${GEMINI_API_BASE_URL}${model}:generateContent?key=${this.apiKey}`,
                  {
                     method: "POST",
                     signal: controller.signal,
                     headers: {
                        "Content-Type": "application/json",
                     },
                     body: JSON.stringify({
                        contents,
                        system_instruction: {
                           parts: [{ text: systemPrompt }],
                        },
                        generationConfig: {
                           maxOutputTokens: 2048,
                           temperature: 0.4,
                           ...generationConfig,
                        },
                     }),
                  },
               );

               clearTimeout(timeout);

               const responseData = await response.json();

               if (!response.ok) {
                  console.error(
                     `[Gemini ${model}] API Error`,
                     JSON.stringify(responseData, null, 2),
                  );

                  lastError = responseData;

                  if (!RETRYABLE_STATUS_CODES.includes(response.status)) {
                     throw new HttpError(
                        response.status,
                        "GEMINI_API_ERROR",
                        JSON.stringify(responseData),
                     );
                  }

                  continue;
               }

               const text =
                  responseData?.candidates?.[0]?.content?.parts?.[0]?.text;

               if (typeof text === "string" && text.trim().length > 0) {
                  return text;
               }

               lastError = responseData;
            } catch (error) {
               clearTimeout(timeout);

               console.error(`[Gemini ${model}] Request failed`, error);

               lastError = error;

               if (
                  error instanceof HttpError &&
                  !RETRYABLE_STATUS_CODES.includes(error.status)
               ) {
                  throw error;
               }
            }
         }

         const delay = Math.pow(2, attempt) * 1000;

         await new Promise((resolve) => setTimeout(resolve, delay));
      }

      console.error("Final Gemini error:", lastError);

      throw new HttpError(
         502,
         "ASSISTANT_PROVIDER_FAILED",
         "AI Study Assistant provider request failed.",
      );
   }

   async answerStudyQuestion(
      questionText: string,
      history: Array<{ role: string; content: string }> = [],
      searchMode: boolean = false,
      attachments?: Array<{
         name: string;
         type: string;
         extractedText?: string;
         url?: string;
      }>,
   ): Promise<StudyQuestionReply> {
      let systemPrompt = `
      You are a helpful AI study assistant.

      - If attachments are provided, use them to provide accurate answers based on the provided content.
      - If no attachments are provided, use your general knowledge.
      - Keep responses concise, structured, and easy to read.

      - Whenever a user asks for a study plan, provide a 30-minute plan using simple, clean plain text. 
      - Use dashes (-) for bullet points.
      - Do NOT use any Markdown formatting like # headers, **bolding**, or *italics*.
      - Ensure it looks like a clean, simple text document.

      - If a user asks for a quiz, provide a brief, high-level summary or "reviewer" of the core concepts related to the topic (using plain text, no Markdown headers or bolding), then append the hidden tag [[GENERATE_QUIZ]] at the very end.
      `;

      const formattedHistory = formatHistory(history);

      const parts: any[] = [
         {
            text: `
USER QUESTION:
${questionText}

SEARCH MODE:
${searchMode ? "ENABLED" : "DISABLED"}

CONVERSATION HISTORY:
${formattedHistory}
`,
         },
      ];

      if (attachments?.length) {
         const processedAttachments = await Promise.all(
            attachments.map(async (att) => {
               if (att.url && att.type.startsWith("image/")) {
                  const base64 = await this.fetchAttachmentAsBase64(att.url);

                  if (!base64) {
                     return {
                        text: `
[ATTACHMENT FAILED]
File: ${att.name}
`,
                     };
                  }

                  return {
                     inline_data: {
                        mime_type: att.type,
                        data: base64,
                     },
                  };
               }

               const cleanedText = truncateText(
                  sanitizeText(att.extractedText || ""),
                  MAX_ATTACHMENT_CHARS,
               );

               return {
                  text: `
[START ATTACHMENT: ${att.name}]
${cleanedText}
[END ATTACHMENT]
`,
               };
            }),
         );

         parts.push(...processedAttachments);
      }

      const response = await this.request(
         systemPrompt,
         [{ role: "user", parts }],
         {
            temperature: 0.3,
         },
      );

      return parseStudyQuestionReply(response);
   }

   async generateQuiz(
      quizTopic: string,
      questionCount: number,
      attachments?: Array<{
         name: string;
         type: string;
         extractedText?: string;
      }>,
   ): Promise<GeneratedQuiz> {
      let systemPrompt = `
You are a professional educational quiz generator.

CRITICAL: Return ONLY valid JSON.
DO NOT include markdown.
DO NOT include explanations.
DO NOT include any text before or after the JSON.

Use this exact format:
{
  "questions": [
    {
      "questionText": "Question text here?",
      "options": ["A", "B", "C", "D"],
      "correctOptionIndex": 0
    }
  ]
}

RULES:
- Generate exactly ${questionCount} questions.
- Exactly 4 options per question.
- correctOptionIndex must be 0, 1, 2, or 3.
- Questions must test understanding of the provided topic.
- Avoid duplicate concepts.
- Ensure only ONE correct answer.
- Distractors must be plausible.
- Never hallucinate unsupported facts.
`;

      if (attachments?.length) {
         const attachmentContext = attachments
            .map((a) => {
               const cleanedText = truncateText(
                  sanitizeText(a.extractedText || ""),
                  MAX_ATTACHMENT_CHARS,
               );

               return `
[START ATTACHMENT: ${a.name}]
${cleanedText}
[END ATTACHMENT]
`;
            })
            .join("\n");

         systemPrompt += `

CONTEXT FROM ATTACHMENTS:
${attachmentContext}
`;
      }

      const responseText = await this.request(
         systemPrompt,
         [
            {
               role: "user",
               parts: [
                  {
                     text: `
Quiz Topic:
${quizTopic}

Question Count:
${questionCount}
`,
                  },
               ],
            },
         ],
         {
            temperature: 0.7,
            responseMimeType: "application/json",
         },
      );

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
