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

  it("keeps codebase diagrams aligned to the implemented resources", () => {
    const diagrams = readFileSync("docs/codebase-diagrams.md", "utf8");

    expect(diagrams).toContain("StudyQuestion");
    expect(diagrams).toContain("QuizOption");
    expect(diagrams).toContain("StudyProgress");
    expect(diagrams).not.toContain("TodayTask");
  });
});
