import { describe, expect, it } from "vitest";

import { createAssistantProvider } from "../src/assistant/provider.js";

const env = {
  DATABASE_URL: "postgresql://example",
  PORT: 4000,
  NODE_ENV: "test" as const,
  SESSION_SECRET: "test-session-secret-with-enough-length",
  FRONTEND_ORIGINS: "http://localhost:3000",
};

describe("assistant provider", () => {
  it("answers study questions with deterministic placeholder output in test", async () => {
    const provider = createAssistantProvider(env);

    await expect(provider.answerStudyQuestion("What is photosynthesis?")).resolves.toEqual({
      content: "Study answer: What is photosynthesis?",
    });
  });

  it("generates deterministic multiple-choice quizzes in test", async () => {
    const provider = createAssistantProvider(env);

    const quiz = await provider.generateQuiz("Algebra", 3);

    expect(quiz.questions).toHaveLength(3);
    expect(quiz.questions[0]).toEqual({
      questionText: "Algebra practice question 1",
      options: ["Option A", "Option B", "Option C", "Option D"],
      correctOptionIndex: 0,
    });
  });
});
