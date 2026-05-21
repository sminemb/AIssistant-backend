const dateFormatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timezone: string) {
  const cached = dateFormatterCache.get(timezone);
  if (cached) {
    return cached;
  }

  const created = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  dateFormatterCache.set(timezone, created);
  return created;
}

export function studentDayKey(date: Date, timezone: string): string {
  const parts = formatter(timezone).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error(`Could not derive student day for timezone ${timezone}`);
  }

  return `${year}-${month}-${day}`;
}

export function dateOnlyFromKey(dayKey: string): Date {
  return new Date(`${dayKey}T00:00:00.000Z`);
}

export function addDays(dayKey: string, days: number): string {
  const date = dateOnlyFromKey(dayKey);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function lastStudentDays(timezone: string, count: number, now = new Date()): string[] {
  const today = studentDayKey(now, timezone);
  return Array.from({ length: count }, (_, index) => addDays(today, index - count + 1));
}

export function todayFor(timezone: string, now = new Date()): Date {
  return dateOnlyFromKey(studentDayKey(now, timezone));
}

export function dueSoonWindow(timezone: string, now = new Date()) {
  const today = studentDayKey(now, timezone);
  const through = addDays(today, 14);

  return {
    today,
    through,
    todayDate: dateOnlyFromKey(today),
    throughDate: dateOnlyFromKey(through),
  };
}
