import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("diagram-domain documentation", () => {
  it("documents the diagram-aligned domain terms", () => {
    const context = readFileSync("CONTEXT.md", "utf8");

    expect(context).toContain("**Study Question**");
    expect(context).toContain("**Quiz Question**");
    expect(context).toContain("**Quiz Option**");
    expect(context).toContain("**Study Progress**");
    expect(context).not.toContain("**Task**");
    expect(context).not.toContain("**Course**");
  });

  it("keeps frontend-facing docs on the diagram-domain contract", () => {
    const frontendGuide = readFileSync("docs/frontend-integration.md", "utf8");
    const handoff = readFileSync("FRONTEND_HANDOFF.md", "utf8");
    const readme = readFileSync("README.md", "utf8");
    const combined = `${frontendGuide}\n${handoff}\n${readme}`;

    expect(combined).toContain("/study-questions");
    expect(combined).toContain("/quizzes");
    expect(combined).toContain("/study-progress");
    expect(combined).not.toContain("/tasks");
    expect(combined).not.toContain("/courses");
    expect(combined).not.toContain("/conversations");
    expect(combined).not.toContain("/today-tasks");
  });
});
