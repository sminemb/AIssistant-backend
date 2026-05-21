import { describe, expect, it } from "vitest";

import { addDays, dueSoonWindow, lastStudentDays, studentDayKey } from "../src/domain/dates.js";

describe("student date boundaries", () => {
  it("derives Student Day from the student's timezone", () => {
    const instant = new Date("2026-05-20T18:00:00.000Z");

    expect(studentDayKey(instant, "Asia/Manila")).toBe("2026-05-21");
    expect(studentDayKey(instant, "America/New_York")).toBe("2026-05-20");
  });

  it("builds the due soon window as today through 14 days", () => {
    const window = dueSoonWindow("Asia/Manila", new Date("2026-05-21T01:00:00.000Z"));

    expect(window.today).toBe("2026-05-21");
    expect(window.through).toBe("2026-06-04");
  });

  it("returns the last seven Student Days", () => {
    expect(lastStudentDays("Asia/Manila", 7, new Date("2026-05-21T01:00:00.000Z"))).toEqual([
      "2026-05-15",
      "2026-05-16",
      "2026-05-17",
      "2026-05-18",
      "2026-05-19",
      "2026-05-20",
      "2026-05-21",
    ]);
  });

  it("adds days across month boundaries", () => {
    expect(addDays("2026-05-31", 1)).toBe("2026-06-01");
  });
});
