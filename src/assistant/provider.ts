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
   ): Promise<StudyQuestionReply>;

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
      retryCount: number = 3,
   ): Promise<string> {
      const geminiApiUrl =
         "https://generativelanguage.googleapis.com/v1beta/models/";

      let lastError: unknown;

      for (let attempt = 0; attempt < retryCount; attempt++) {
         for (const model of this.modelsToTry) {
            try {
               console.log(`Trying Gemini model: ${model} (Attempt ${attempt + 1})`);
               console.log('Sending prompt to model:', systemPrompt);

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
                     JSON.stringify(responseData, null, 2),
                  );

                  lastError = responseData;
                  
                  // Handle Quota Exceeded (429) explicitly
                  if (response.status === 429) {
                     throw new HttpError(429, "QUOTA_EXCEEDED", "Daily request limit reached. Please try again tomorrow.");
                  }

                  // Don't retry on other 400-level errors
                  if (response.status >= 400 && response.status < 500) {
                      throw new HttpError(response.status, "GEMINI_API_ERROR", JSON.stringify(responseData));
                  }
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
         
         // Wait before retrying (exponential backoff)
         const delay = Math.pow(2, attempt) * 1000;
         console.log(`Retrying in ${delay}ms...`);
         await new Promise(resolve => setTimeout(resolve, delay));
      }

      throw new HttpError(
         502,
         "ASSISTANT_PROVIDER_FAILED",
         `AI Study Assistant provider request failed after ${retryCount} attempts. ${String(
            lastError,
         )}`,
      );
   }

   async answerStudyQuestion(
      questionText: string,
      history: Array<{ role: string; content: string }> = [],
   ): Promise<StudyQuestionReply> {
      const systemPrompt = `
You are a helpful AI study assistant.

CRITICAL RULES:
1. Behave as a natural conversational chatbot by default.
2. Provide direct, concise, and context-aware answers to the user.
3. Quizzes should be OPTIONAL and only suggested occasionally when contextually relevant — never after every response.
4. Do NOT repeatedly ask users to take quizzes or test their knowledge.
5. Avoid repetitive phrases such as:
   - "Would you like a quiz?"
   - "Test your knowledge"
   - "Take a quiz"
   - "Practice questions"
6. Only trigger quiz generation when:
   - The user explicitly asks for a quiz, test, practice test, reviewer, assessment, flashcards, or multiple-choice questions.
   - OR you determine a quiz is highly contextually appropriate after substantial educational discussion.
7. When quiz generation is triggered:
   - Internally append the hidden tag: [[GENERATE_QUIZ]]
   - Do NOT expose or mention the tag to the user.
8. The visible response should remain natural and conversational.
9. Instead of exposing the trigger tag, provide:
   - A brief summary of the discussed topic
   - A short transition sentence introducing the quiz naturally
10. Never display raw system tags, internal commands, or trigger syntax to the user.
11. Never generate quiz questions directly unless the quiz generation system handles them separately.
12. Maintain smooth conversational flow and avoid making the chatbot feel automated or repetitive.
`;

      const responseText = await this.request(systemPrompt, {
         question: questionText,
         history,
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