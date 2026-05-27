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

   generateTopics(): Promise<string[]>;
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

   if (cleaned.startsWith("{")) {
      try {
         const data = JSON.parse(cleaned);
         if (typeof data?.content === "string") {
            return { content: data.content };
         }
      } catch {
         // Fallback to plain text on JSON parse failure
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

   async generateTopics(): Promise<string[]> {
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
                           temperature: 0.6,
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
      // =====================================================
      // INTENT DETECTION
      // =====================================================
      const lowerQuestion = questionText.toLowerCase();

      const isStudyPlan =
         lowerQuestion.includes("study plan") ||
         lowerQuestion.includes("30-minute") ||
         lowerQuestion.includes("30 minute") ||
         lowerQuestion.includes("schedule") ||
         lowerQuestion.includes("study routine") ||
         lowerQuestion.includes("study schedule") ||
         lowerQuestion.includes("learning roadmap") ||
         lowerQuestion.includes("review routine") ||
         lowerQuestion.includes("revision timetable");

      const isQuizRequest =
         lowerQuestion.includes("quiz") ||
         lowerQuestion.includes("practice test") ||
         lowerQuestion.includes("practice questions") ||
         lowerQuestion.includes("assessment") ||
         lowerQuestion.includes("reviewer") ||
         lowerQuestion.includes("mock test");

      // =====================================================
      // SYSTEM PROMPT
      // =====================================================
      let systemPrompt = `
You are AIsisstant, a premium AI study assistant.

PERSONALITY:
- Smart, modern, and engaging
- Educational but conversational
- Clear and easy to understand
- Avoid robotic or textbook-like responses

GLOBAL RULES:
- Never hallucinate facts
- If unsure, say:
"I do not have enough information."
- Keep answers concise but meaningful
- Avoid repetitive filler
- Prioritize clarity over complexity

// MODE PRIORITY:
// 1. QUIZ_REQUEST
// 2. STUDY_PLAN
// 3. WEB_SEARCH
// 4. STUDY_EXPLANATION

// Higher priority modes OVERRIDE lower modes completely.
`;

      // =====================================================
      // STUDY PLAN MODE
      // =====================================================
      if (isStudyPlan) {
         systemPrompt += `

CURRENT MODE: STUDY_PLAN

THIS MODE HAS ABSOLUTE PRIORITY.

CRITICAL RULES FOR LINE BREAKS AND VISUAL FORMATTING:
- Use EXACTLY two newline characters (\\n\\n) to create a single visible blank line between major blocks.
- Do NOT merge paragraphs together. Preserve the vertical spacing.
- Plain text characters ONLY.
- Absolutely NO markdown elements such as bold (**), italics (*), bullet lists (-), horizontal lines (---), markdown headers (#), or tags.
- NO introductions, conclusions (except the footer), or filler text.
- DO NOT repeat the user's request.

REQUIRED FORMAT (MUST USE EXACTLY TWO NEWLINES TO SEPARATE SECTIONS):

30-Minute Focus Session: [Topic]

Goal:
[One concise sentence on the learning goal]

00:00 - 00:05
[Actionable description]

00:05 - 00:15
[Actionable description]

00:15 - 00:25
[Actionable description]

00:25 - 00:30
[Actionable description]

Small consistent sessions build stronger long-term memory.

IMPORTANT: Ensure there is exactly one empty line (two newlines) separating each block. Do not run text together on adjacent lines.
`;
      }
      // =====================================================
      // QUIZ REQUEST MODE
      // =====================================================
      else if (isQuizRequest) {
         systemPrompt += `

CURRENT MODE: QUIZ_REQUEST

STRICT RULES:
- DO NOT generate actual quiz questions
- Create a concise reviewer
- Organize concepts clearly
- Use markdown formatting
- End with:
[[GENERATE_QUIZ]]

FORMAT:

## Topic Reviewer

- Item

### Important Ideas
Short explanation

[[GENERATE_QUIZ]]
`;
      }
      // =====================================================
      // WEB SEARCH MODE
      // =====================================================
      else if (searchMode) {
         systemPrompt += `

CURRENT MODE: WEB_SEARCH

STRICT RULES:
- Use polished markdown formatting
- Use concise summaries
- Avoid walls of text
- Cite ALL sources:
  [Source](URL)

FORMAT:

## Details

## Sources
`;
      }
      // =====================================================
      // STUDY EXPLANATION MODE
      // =====================================================
      else {
         systemPrompt += `

CURRENT MODE: STUDY_EXPLANATION

STRICT RULES:
- Use markdown formatting
- Explain concepts simply first
- Use examples when useful
- Avoid Wikipedia-style wording

FORMAT:

## Key Concepts

## Example

## Quick Recap
`;
      }

      // =====================================================
      // HISTORY
      // =====================================================
      const formattedHistory = formatHistory(history);

      // =====================================================
      // PARTS
      // =====================================================
      const parts: any[] = [
         {
            text: `
USER QUESTION:
${questionText}

ACTIVE MODE:
${
   isStudyPlan
      ? "STUDY_PLAN"
      : isQuizRequest
        ? "QUIZ_REQUEST"
        : searchMode
          ? "WEB_SEARCH"
          : "STUDY_EXPLANATION"
}

SEARCH MODE:
${searchMode ? "ENABLED" : "DISABLED"}

CONVERSATION HISTORY:
${formattedHistory}
`,
         },
      ];

      // =====================================================
      // ATTACHMENTS
      // =====================================================
      if (attachments?.length) {
         const processedAttachments = await Promise.all(
            attachments.map(async (att) => {
               // IMAGE ATTACHMENTS
               if (att.url && att.type.startsWith("image/")) {
                  const base64 = await this.fetchAttachmentAsBase64(att.url);
                  if (!base64) {
                     return {
                        text: `\n[ATTACHMENT FAILED]\nFile: ${att.name}\n`,
                     };
                  }
                  return {
                     inline_data: {
                        mime_type: att.type,
                        data: base64,
                     },
                  };
               }

               // TEXT ATTACHMENTS
               const cleanedText = truncateText(
                  sanitizeText(att.extractedText || ""),
                  MAX_ATTACHMENT_CHARS,
               );
               return {
                  text: `\n[START ATTACHMENT: ${att.name}]\n${cleanedText}\n[END ATTACHMENT]\n`,
               };
            }),
         );
         parts.push(...processedAttachments);
      }

      // =====================================================
      // REQUEST
      // =====================================================
      const response = await this.request(
         systemPrompt,
         [
            {
               role: "user",
               parts,
            },
         ],
         {
            temperature: isStudyPlan ? 0.1 : 0.7,
            maxOutputTokens: 2048,
         },
      );

      // =====================================================
      // RETURN
      // =====================================================
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
               return `\n[START ATTACHMENT: ${a.name}]\n${cleanedText}\n[END ATTACHMENT]\n`;
            })
            .join("\n");

         systemPrompt += `\nCONTEXT FROM ATTACHMENTS:\n${attachmentContext}\n`;
      }

      const responseText = await this.request(
         systemPrompt,
         [
            {
               role: "user",
               parts: [
                  {
                     text: `\nQuiz Topic:\n${quizTopic}\n\nQuestion Count:\n${questionCount}\n`,
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
   async generateTopics(): Promise<string[]> {
      const systemPrompt = `
Generate 5 diverse, interesting, and academic study topics for a quiz.
Return ONLY a JSON array of strings.
Example: ["Quantum Physics", "World History", "Calculus", "Web Development", "Art History"]
`;
      const response = await this.request(systemPrompt, [{ role: "user", parts: [{ text: "Generate 5 study topics" }] }], {
         temperature: 0.7,
         responseMimeType: "application/json",
      });

      try {
         return JSON.parse(cleanJsonResponse(response));
      } catch {
         return ["Quantum Physics", "World History", "Calculus", "Web Development", "Art History"];
      }
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

   async generateTopics(): Promise<string[]> {
      return ["Quantum Physics", "World History", "Calculus", "JavaScript Closures", "Photosynthesis", "Macroeconomics", "Web Development", "Artificial Intelligence", "Organic Chemistry", "Art History"];
   }
}
