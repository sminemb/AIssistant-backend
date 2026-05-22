import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const guide = readFileSync("docs/frontend-integration.md", "utf8");

describe("Frontend integration handoff guide", () => {
  it("documents the practical runtime integration handoff", () => {
    expect(guide).toContain("Do not edit the frontend as part of backend-only work.");

    for (const orderedStep of [
      "1. Auth/session and `/auth/me`",
      "2. Dashboard Summary",
      "3. Task and Today's Tasks mutations",
      "4. Conversations and Messages",
      "5. Suggested Task confirmation and dismissal",
    ]) {
      expect(guide).toContain(orderedStep);
    }

    for (const authDetail of ['credentials: "include"', "/auth/me", "/auth/csrf", "X-CSRF-Token"]) {
      expect(guide).toContain(authDetail);
    }

    expect(guide).toContain("CSRF_TOKEN_INVALID");
    expect(guide).toContain("Real Student accounts start empty.");
    expect(guide).toContain("development-only sample data");
    expect(guide).toContain("Dashboard Summary is the authenticated landing read model.");
    expect(guide).toContain("optimistic Task UI");
    expect(guide).toContain("rollback");
    expect(guide).toContain("refetch");
    expect(guide).toContain("guidance, not mandates");
  });
});
