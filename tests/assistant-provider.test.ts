import { describe, expect, it, vi } from "vitest";

import { createAssistantProvider } from "../src/assistant/provider.js";

const emptyContext = {
  courses: [],
  dueSoonTasks: [],
  todaysTasks: [],
  recentMessages: [],
};

describe("AI Study Assistant provider selection", () => {
  it("uses the deterministic placeholder outside configured Anthropic environments", async () => {
    const provider = createAssistantProvider({ NODE_ENV: "test" });

    await expect(provider.reply("Explain photosynthesis", emptyContext)).resolves.toEqual({
      content: "Share the topic or Course, and I will break it into simple steps with an example.",
      suggestedTasks: [],
    });
  });

  it("fails clearly on assistant use when production Anthropic configuration is missing", async () => {
    const provider = createAssistantProvider({ NODE_ENV: "production" });

    await expect(provider.reply("Explain photosynthesis", emptyContext)).rejects.toMatchObject({
      statusCode: 503,
      code: "ASSISTANT_PROVIDER_NOT_CONFIGURED",
      message: "AI Study Assistant provider is not configured",
    });
  });

  it("calls Anthropic behind the AssistantProvider interface when configured", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              content: "Review active recall notes before the exam.",
              suggestedTasks: [{ title: "Review Biology notes", notes: "Focus on active recall." }],
            }),
          },
        ],
      }),
    }));
    const provider = createAssistantProvider(
      {
        NODE_ENV: "production",
        ANTHROPIC_API_KEY: "test-api-key",
        ANTHROPIC_MODEL: "test-model",
      },
      fetchMock as never,
    );

    const reply = await provider.reply("Make a study plan", {
      courses: [{ id: "course-1", name: "Biology", archivedAt: null }],
      dueSoonTasks: [
        {
          id: "task-1",
          studentId: "student-1",
          courseId: "course-1",
          title: "Read chapter 8",
          notes: null,
          dueDateKind: "DATE_ONLY",
          dueDate: new Date("2026-05-30T00:00:00.000Z"),
          dueAt: null,
          completedAt: null,
          deletedAt: null,
          createdAt: new Date("2026-05-20T00:00:00.000Z"),
          updatedAt: new Date("2026-05-20T00:00:00.000Z"),
        },
      ],
      todaysTasks: [],
      recentMessages: [{ author: "STUDENT", content: "Make a study plan" }],
    });

    expect(reply).toEqual({
      content: "Review active recall notes before the exam.",
      suggestedTasks: [{ title: "Review Biology notes", notes: "Focus on active recall." }],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/messages",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
          "x-api-key": "test-api-key",
        }),
      }),
    );
    const [, requestInit] = fetchMock.mock.calls[0] as unknown as [string, { body?: string }];
    const requestBody = JSON.parse(String(requestInit.body));
    expect(requestBody).toMatchObject({
      model: "test-model",
      messages: [{ role: "user", content: expect.stringContaining("Make a study plan") }],
    });
    expect(requestBody.messages[0].content).toContain("dueSoonTasks");
    expect(requestBody.messages[0].content).not.toContain("passwordHash");
  });
});
