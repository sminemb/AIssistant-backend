import { z } from "zod";

import { HttpError } from "../http/errors.js";

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
  generateQuiz(quizTopic: string, questionCount: number): Promise<GeneratedQuiz>;
}

type AssistantProviderEnv = {
  NODE_ENV: "development" | "test" | "production";
  ANTHROPIC_API_KEY?: string | undefined;
  ANTHROPIC_MODEL?: string | undefined;
};

type Fetch = typeof fetch;

const anthropicReplySchema = z.object({
  content: z.string().trim().min(1),
});

const anthropicQuizSchema = z.object({
  questions: z
    .array(
      z.object({
        questionText: z.string().trim().min(1),
        options: z.array(z.string().trim().min(1)).length(4),
        correctOptionIndex: z.number().int().min(0).max(3),
      }),
    )
    .min(1)
    .max(10),
});

function textFromAnthropicResponse(responseBody: unknown) {
  if (!responseBody || typeof responseBody !== "object" || !("content" in responseBody)) {
    return "";
  }

  const content = (responseBody as { content: unknown }).content;
  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((block) => {
      if (block && typeof block === "object" && "type" in block && block.type === "text" && "text" in block) {
        return String(block.text);
      }
      return "";
    })
    .join("")
    .trim();
}

function parseStudyQuestionReply(text: string): StudyQuestionReply {
  try {
    const parsed = anthropicReplySchema.safeParse(JSON.parse(text));
    if (parsed.success) {
      return parsed.data;
    }
  } catch {
    // Fall through to treating provider text as the assistant response.
  }

  return { content: text || "I could not produce a study response right now." };
}

function parseGeneratedQuiz(text: string, questionCount: number): GeneratedQuiz {
  try {
    const parsed = anthropicQuizSchema.safeParse(JSON.parse(text));
    if (parsed.success && parsed.data.questions.length === questionCount) {
      return parsed.data;
    }
  } catch {
    // Fall through to a stable provider failure.
  }

  throw new HttpError(502, "ASSISTANT_PROVIDER_INVALID_RESPONSE", "AI Study Assistant provider returned invalid quiz data");
}

class MissingAssistantProvider implements AssistantProvider {
  async answerStudyQuestion(): Promise<StudyQuestionReply> {
    throw new HttpError(503, "ASSISTANT_PROVIDER_NOT_CONFIGURED", "AI Study Assistant provider is not configured");
  }

  async generateQuiz(): Promise<GeneratedQuiz> {
    throw new HttpError(503, "ASSISTANT_PROVIDER_NOT_CONFIGURED", "AI Study Assistant provider is not configured");
  }
}

export class AnthropicAssistantProvider implements AssistantProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly fetchImpl: Fetch = globalThis.fetch,
  ) {}

  private async request(system: string, content: unknown) {
    const response = await this.fetchImpl("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
        "x-api-key": this.apiKey,
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 1200,
        system,
        messages: [{ role: "user", content: JSON.stringify(content) }],
      }),
    });

    if (!response.ok) {
      throw new HttpError(502, "ASSISTANT_PROVIDER_FAILED", "AI Study Assistant provider request failed");
    }

    return textFromAnthropicResponse(await response.json());
  }

  async answerStudyQuestion(questionText: string): Promise<StudyQuestionReply> {
    const text = await this.request(
      "You are the AI Study Assistant inside AIssistant. Answer only the current study question. Return JSON with a non-empty content string.",
      { questionText },
    );
    return parseStudyQuestionReply(text);
  }

  async generateQuiz(quizTopic: string, questionCount: number): Promise<GeneratedQuiz> {
    const text = await this.request(
      "You are the AI Study Assistant inside AIssistant. Generate a multiple-choice quiz. Return JSON with questions; each question has questionText, exactly four options, and correctOptionIndex from 0 to 3.",
      { quizTopic, questionCount },
    );
    return parseGeneratedQuiz(text, questionCount);
  }
}

export function createAssistantProvider(env: AssistantProviderEnv, fetchImpl?: Fetch): AssistantProvider {
  if (env.ANTHROPIC_API_KEY && env.ANTHROPIC_MODEL) {
    return new AnthropicAssistantProvider(env.ANTHROPIC_API_KEY, env.ANTHROPIC_MODEL, fetchImpl);
  }

  if (env.NODE_ENV === "production") {
    return new MissingAssistantProvider();
  }

  return new PlaceholderAssistantProvider();
}

export class PlaceholderAssistantProvider implements AssistantProvider {
  async answerStudyQuestion(questionText: string): Promise<StudyQuestionReply> {
    return {
      content: `Study answer: ${questionText}`,
    };
  }

  async generateQuiz(quizTopic: string, questionCount: number): Promise<GeneratedQuiz> {
    return {
      questions: Array.from({ length: questionCount }, (_, index) => ({
        questionText: `${quizTopic} practice question ${index + 1}`,
        options: ["Option A", "Option B", "Option C", "Option D"],
        correctOptionIndex: index % 4,
      })),
    };
  }
}
