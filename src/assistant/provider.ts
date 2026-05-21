import type { Task } from "@prisma/client";

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
