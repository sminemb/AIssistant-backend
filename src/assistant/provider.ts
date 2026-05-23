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
   answerStudyQuestion(questionText: string): Promise<StudyQuestionReply>;

   generateQuiz(
      quizTopic: string,
      questionCount: number,
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
      userContent: unknown,
   ): Promise<string> {
      const geminiApiUrl =
         "https://generativelanguage.googleapis.com/v1beta/models/";

      let lastError: unknown;

      for (const model of this.modelsToTry) {
         try {
            console.log(`Trying Gemini model: ${model}`);

            const url = `${geminiApiUrl}${model}:generateContent?key=${this.apiKey}`;

            const response = await this.fetchImpl(url, {
               method: "POST",
               headers: {
                  "Content-Type": "application/json",
               },
               body: JSON.stringify({
                  contents: [
                     {
                        parts: [
                           {
                              text:
                                 `${systemPrompt}\n\n` +
                                 `User request:\n${JSON.stringify(
                                    userContent,
                                 )}`,
                           },
                        ],
                     },
                  ],
               }),
            });

            const responseData = await response.json();

            if (!response.ok) {
               console.error(
                  `Gemini API Error with model ${model}:`,
                  responseData,
               );

               lastError = responseData;
               continue;
            }

            const text =
               responseData?.candidates?.[0]?.content?.parts?.[0]?.text;

            if (text) {
               console.log(`Success using Gemini model: ${model}`);

               return text;
            }

            console.warn(
               `Unexpected Gemini response structure for model ${model}`,
            );

            lastError = responseData;
         } catch (error) {
            console.error(`Gemini request failed for model ${model}:`, error);

            lastError = error;
         }
      }

      throw new HttpError(
         502,
         "ASSISTANT_PROVIDER_FAILED",
         `AI Study Assistant provider request failed after trying all models. ${String(
            lastError,
         )}`,
      );
   }

   async answerStudyQuestion(
      questionText: string,
   ): Promise<StudyQuestionReply> {
      const systemPrompt = `
You are a helpful AI study assistant.

Provide concise and accurate educational answers.
`;

      const responseText = await this.request(systemPrompt, {
         question: questionText,
      });

      return parseStudyQuestionReply(responseText);
   }

   async generateQuiz(
      quizTopic: string,
      questionCount: number,
   ): Promise<GeneratedQuiz> {
      const systemPrompt = `
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