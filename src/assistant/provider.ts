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
      attachments?: Array<{ name: string; type: string; extractedText?: string }>,
   ): Promise<StudyQuestionReply> {
      let systemPrompt = `
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
7. When quiz generation is triggered, you MUST append the hidden tag [[GENERATE_QUIZ]] to the end of your response.
   - Example: "Here is your quiz! [[GENERATE_QUIZ]]"
   - You MUST ensure the tag is present whenever you discuss or initiate a quiz.
8. The visible response should remain natural and conversational.
9. To introduce the quiz, provide a brief summary of the topic or a short, encouraging "breather" context that helps the user feel prepared. End this introduction with the hidden tag: [[GENERATE_QUIZ]]
10. Never display raw system tags, internal commands, or trigger syntax to the user, except for the hidden [[GENERATE_QUIZ]] tag at the end.
11. Never generate quiz questions directly unless the quiz generation system handles them separately.
12. Maintain smooth conversational flow and avoid making the chatbot feel automated or repetitive.
13. If the user has explicitly requested a quiz and a topic is clear, do NOT ask for more details. Proceed directly to generating the quiz using the hidden tag [[GENERATE_QUIZ]].
14. ALWAYS return your response as a JSON object in this exact format: { "content": "your conversational response here" }
`;

      if (searchMode) {
         systemPrompt += `
SEARCH MODE ACTIVE:
- Actively use your internal knowledge as if you are searching the web for the latest, most accurate information.
- Prioritize real-world facts, recent developments, and verified data.
- If the user asks about current events or specific details that require search-like precision, prioritize those.
`;
      }

      if (attachments && attachments.length > 0) {
          systemPrompt += `
ATTACHMENTS PROVIDED:
I have provided ${attachments.length} new attachment(s) for you to analyze.
- You MUST scan the content of these files to answer the user's questions.
- IGNORE any previous file contexts or topics from earlier in this conversation. Focus ONLY on the content of these new attachments.
${attachments.map(a => `
--- FILE: ${a.name} ---
${this.getFileInstruction(a.name, a.type)}
--- CONTENT ---
${a.extractedText || "[No text content extracted]"}`).join('\n')}
- PROACTIVE ACTION: After providing a brief summary of the file content, you MUST proactively offer to create a quiz based on the material in the file to help the user test their understanding. Include the hidden trigger tag [[GENERATE_QUIZ]] at the end if you offer the quiz.
`;
      }

      const response = await this.request(systemPrompt, { question: questionText, history });
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
