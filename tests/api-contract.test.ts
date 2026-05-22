import { describe, expect, it } from "vitest";

import { buildServer } from "../src/server.js";

const env = {
  DATABASE_URL: "postgresql://example",
  PORT: 4000,
  NODE_ENV: "test" as const,
  SESSION_SECRET: "test-session-secret-with-enough-length",
  FRONTEND_ORIGINS: "http://localhost:3000",
};

describe("Stable REST contract", () => {
  it("keeps routes unversioned and returns stable error envelopes", async () => {
    const app = await buildServer(env);

    const health = await app.inject({ method: "GET", url: "/health" });
    const versionedHealth = await app.inject({ method: "GET", url: "/v1/health" });
    const invalidRegister = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        email: "not-an-email",
        password: "short",
        displayName: "",
        timezone: "",
      },
    });

    expect(health.statusCode).toBe(200);
    expect(health.json()).toEqual({ ok: true });

    expect(versionedHealth.statusCode).toBe(404);
    expect(versionedHealth.json()).toEqual({
      error: { code: "ROUTE_NOT_FOUND", message: "Route not found" },
    });

    expect(invalidRegister.statusCode).toBe(400);
    expect(invalidRegister.json()).toMatchObject({
      error: {
        code: "VALIDATION_FAILED",
        message: "Request validation failed",
        issues: expect.any(Array),
      },
    });

    await app.close();
  });
});
