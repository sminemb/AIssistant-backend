import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const readme = readFileSync("README.md", "utf8");

describe("REST integration contract documentation", () => {
  it("documents stable unversioned DTO names and domain API terms", () => {
    expect(readme).toContain("## Stable REST Contract");
    expect(readme).toContain("Routes are unversioned");
    expect(readme).not.toContain("/v1/");
    expect(readme).toContain("dueSoonTasks");
    expect(readme).toContain("todaysTasks");
    expect(readme).not.toMatch(/\bdeadlines?\b/i);

    for (const dtoName of [
      "StudentDTO",
      "CourseDTO",
      "TaskDTO",
      "TodayTaskDTO",
      "DashboardSummaryDTO",
      "ConversationDTO",
      "MessageDTO",
      "SuggestedTaskDTO",
      "ErrorEnvelope",
    ]) {
      expect(readme).toContain(dtoName);
    }
  });
});
