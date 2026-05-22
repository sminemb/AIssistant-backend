import type { Task } from "@prisma/client";
import { z } from "zod";

import { HttpError } from "../http/errors.js";

export type AssistantContext = {
  courses: Array<{ id: string; name: string; archivedAt: Date | null }>;
  dueSoonTasks: Task[];
  todaysTasks: Task[];
  recentMessages: Array<{ author: "STUDENT" | "ASSISTANT"; content: string }>;
};

export type AssistantSuggestedTask = {
  title: string;
  notes?: string;
  courseId?: string | null;
  dueDate?: string;
  dueAt?: string;
};

export type AssistantReply = {
  content: string;
  suggestedTasks: AssistantSuggestedTask[];
};

export interface AssistantProvider {
  reply(prompt: string, context: AssistantContext): Promise<AssistantReply>;
}

type AssistantProviderEnv = {
  NODE_ENV: "development" | "test" | "production";
  ANTHROPIC_API_KEY?: string | undefined;
  ANTHROPIC_MODEL?: string | undefined;
};

type Fetch = typeof fetch;

const anthropicReplySchema = z.object({
  content: z.string().trim().min(1),
  suggestedTasks: z
    .array(
      z.object({
        title: z.string().trim().min(1),
        notes: z.string().trim().optional(),
        courseId: z.string().nullable().optional(),
        dueDate: z.string().optional(),
        dueAt: z.string().optional(),
      }),
    )
    .default([]),
});

function taskContext(task: Task) {
  return {
    id: task.id,
    courseId: task.courseId,
    title: task.title,
    notes: task.notes,
    dueDateKind: task.dueDateKind,
    dueDate: task.dueDate?.toISOString() ?? null,
    dueAt: task.dueAt?.toISOString() ?? null,
    completedAt: task.completedAt?.toISOString() ?? null,
  };
}

function buildAnthropicPrompt(prompt: string, context: AssistantContext) {
  return JSON.stringify({
    studentMessage: prompt,
    assistantContext: {
      courses: context.courses.map((course) => ({
        id: course.id,
        name: course.name,
        archivedAt: course.archivedAt?.toISOString() ?? null,
      })),
      dueSoonTasks: context.dueSoonTasks.map(taskContext),
      todaysTasks: context.todaysTasks.map(taskContext),
      recentMessages: context.recentMessages,
    },
  });
}

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

function parseAssistantReply(text: string): AssistantReply {
  try {
    const parsed = anthropicReplySchema.safeParse(JSON.parse(text));
    if (parsed.success) {
      return parsed.data;
    }
  } catch {
    // Fall through to treating provider text as the assistant response.
  }

  return { content: text || "I could not produce a study response right now.", suggestedTasks: [] };
}

class MissingAssistantProvider implements AssistantProvider {
  async reply(): Promise<AssistantReply> {
    throw new HttpError(503, "ASSISTANT_PROVIDER_NOT_CONFIGURED", "AI Study Assistant provider is not configured");
  }
}

export class AnthropicAssistantProvider implements AssistantProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly fetchImpl: Fetch = globalThis.fetch,
  ) {}

  async reply(prompt: string, context: AssistantContext): Promise<AssistantReply> {
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
        system:
          "You are the AI Study Assistant inside AIssistant. Use only the supplied Assistant Context. Return JSON with content and suggestedTasks.",
        messages: [{ role: "user", content: buildAnthropicPrompt(prompt, context) }],
      }),
    });

    if (!response.ok) {
      throw new HttpError(502, "ASSISTANT_PROVIDER_FAILED", "AI Study Assistant provider request failed");
    }

    const text = textFromAnthropicResponse(await response.json());
    return parseAssistantReply(text);
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
  async reply(prompt: string, context: AssistantContext): Promise<AssistantReply> {
    const normalized = prompt.toLowerCase();

    if (normalized.includes("study plan")) {
      const suggestedTasks = context.dueSoonTasks.slice(0, 3).map((task) => ({
        title: `Work on ${task.title}`,
        notes: "Suggested by the AI Study Assistant from your due soon tasks.",
        courseId: task.courseId,
      }));

      return {
        content:
          suggestedTasks.length > 0
            ? "I found a few priorities and drafted Suggested Tasks for your study plan. Confirm the ones you want to add."
            : "I can make a study plan once you have Tasks with Due Dates or tell me what you want to focus on.",
        suggestedTasks,
      };
    }

    if (normalized.includes("quiz")) {
      return {
        content:
          "I can generate practice questions here in the Conversation. Persisted quizzes are outside the first backend scope.",
        suggestedTasks: [],
      };
    }

    if (normalized.includes("explain")) {
      return {
        content:
          "Share the topic or Course, and I will break it into simple steps with an example.",
        suggestedTasks: [],
      };
    }

    return {
      content:
        "I can help with planning, explanations, practice questions, and study focus. Tell me what you want to work on next.",
      suggestedTasks: [],
    };
  }
}
