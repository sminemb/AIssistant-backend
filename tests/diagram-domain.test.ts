import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type UserRecord = {
  id: number;
  name: string;
  email: string;
  passwordHash: string;
  role: "STUDENT" | "ADMIN";
  createdAt: Date;
};

type SessionRecord = {
  id: number;
  userId: number;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
};

type StudyQuestionRecord = {
  id: number;
  userId: number;
  questionText: string;
  chatbotResponse: string;
  createdAt: Date;
};

type QuizRecord = {
  id: number;
  userId: number;
  quizTopic: string;
  score: number | null;
  state: "GENERATED" | "COMPLETED";
  createdAt: Date;
  updatedAt: Date;
};

type QuizQuestionRecord = {
  id: number;
  quizId: number;
  questionText: string;
  position: number;
};

type QuizOptionRecord = {
  id: number;
  quizQuestionId: number;
  optionText: string;
  position: number;
  isCorrect: boolean;
};

type QuizAnswerRecord = {
  id: number;
  quizId: number;
  quizQuestionId: number;
  selectedOptionId: number;
  isCorrect: boolean;
  createdAt: Date;
};

type StudyProgressRecord = {
  id: number;
  userId: number;
  completedTopics: number;
  totalQuizzes: number;
  averageScore: number;
  updatedAt: Date;
};

const store = vi.hoisted(() => ({
  nextId: 1,
  users: [] as UserRecord[],
  sessions: [] as SessionRecord[],
  studyQuestions: [] as StudyQuestionRecord[],
  conversations: [] as { id: number; userId: number; title: string; createdAt: Date; updatedAt: Date }[],
  quizzes: [] as QuizRecord[],
  quizQuestions: [] as QuizQuestionRecord[],
  quizOptions: [] as QuizOptionRecord[],
  quizAnswers: [] as QuizAnswerRecord[],
  studyProgress: [] as StudyProgressRecord[],
}));

function nextId() {
  store.nextId += 1;
  return store.nextId - 1;
}

function orderDescByCreatedAt<T extends { createdAt: Date }>(records: T[]) {
  return [...records].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
}

function includeQuiz(quiz: QuizRecord) {
  return {
    ...quiz,
    questions: store.quizQuestions
      .filter((question) => question.quizId === quiz.id)
      .map((question) => ({
        ...question,
        options: store.quizOptions.filter((option) => option.quizQuestionId === question.id),
        answer: store.quizAnswers.find((answer) => answer.quizQuestionId === question.id) ?? null,
      })),
  };
}

function updateProgress(userId: number) {
  const completed = store.quizzes.filter((quiz) => quiz.userId === userId && quiz.state === "COMPLETED");
  const completedTopics = new Set(completed.map((quiz) => quiz.quizTopic.toLowerCase())).size;
  const totalQuizzes = completed.length;
  const averageScore =
    totalQuizzes === 0 ? 0 : completed.reduce((total, quiz) => total + (quiz.score ?? 0), 0) / totalQuizzes;
  let progress = store.studyProgress.find((candidate) => candidate.userId === userId);

  if (!progress) {
    progress = { id: nextId(), userId, completedTopics, totalQuizzes, averageScore, updatedAt: new Date() };
    store.studyProgress.push(progress);
  } else {
    progress.completedTopics = completedTopics;
    progress.totalQuizzes = totalQuizzes;
    progress.averageScore = averageScore;
    progress.updatedAt = new Date();
  }

  return progress;
}

const prismaMock = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(async ({ where }: { where: { email?: string } }) =>
      where.email ? store.users.find((user) => user.email === where.email) ?? null : null,
    ),
    create: vi.fn(async ({ data }: { data: { email: string; passwordHash: string; name: string; role?: "STUDENT" | "ADMIN"; studyProgress?: unknown } }) => {
      const user = {
        id: nextId(),
        email: data.email,
        passwordHash: data.passwordHash,
        name: data.name,
        role: data.role ?? "STUDENT",
        createdAt: new Date(),
      };
      store.users.push(user);
      if (data.studyProgress) {
        store.studyProgress.push({
          id: nextId(),
          userId: user.id,
          completedTopics: 0,
          totalQuizzes: 0,
          averageScore: 0,
          updatedAt: new Date(),
        });
      }
      return user;
    }),
  },
  session: {
    create: vi.fn(async ({ data }: { data: { userId: number; tokenHash: string; expiresAt: Date } }) => {
      const session = { id: nextId(), userId: data.userId, tokenHash: data.tokenHash, expiresAt: data.expiresAt, revokedAt: null, createdAt: new Date() };
      store.sessions.push(session);
      return session;
    }),
    findUnique: vi.fn(async ({ where }: { where: { tokenHash: string }; include?: { user?: boolean } }) => {
      const session = store.sessions.find((candidate) => candidate.tokenHash === where.tokenHash);
      return session ? { ...session, user: store.users.find((user) => user.id === session.userId) ?? null } : null;
    }),
    updateMany: vi.fn(async () => ({ count: 0 })),
  },
  conversation: {
    findMany: vi.fn(async ({ where, take }: { where: { userId: number }; take?: number }) => {
      const ordered = orderDescByCreatedAt(store.conversations.filter((conv) => conv.userId === where.userId));
      return take ? ordered.slice(0, take) : ordered;
    }),
    create: vi.fn(async ({ data }: { data: { userId: number; title: string } }) => {
      const conversation = { id: nextId(), ...data, createdAt: new Date(), updatedAt: new Date() };
      store.conversations.push(conversation);
      return conversation;
    }),
  },
  studyQuestion: {
    findMany: vi.fn(async ({ where, take }: { where: { userId: number }; take?: number }) => {
      const ordered = orderDescByCreatedAt(store.studyQuestions.filter((question) => question.userId === where.userId));
      return take ? ordered.slice(0, take) : ordered;
    },
    ),
    create: vi.fn(async ({ data }: { data: { userId: number; questionText: string; chatbotResponse: string } }) => {
      const studyQuestion = { id: nextId(), ...data, createdAt: new Date() };
      store.studyQuestions.push(studyQuestion);
      return studyQuestion;
    }),
  },
  quiz: {
    findMany: vi.fn(async ({ where, take }: { where: { userId: number; state?: "COMPLETED"; score?: { not: null } }; take?: number }) => {
      let quizzes = store.quizzes.filter((quiz) => quiz.userId === where.userId);
      if (where.state) quizzes = quizzes.filter((quiz) => quiz.state === where.state);
      if (where.score) quizzes = quizzes.filter((quiz) => quiz.score !== null);
      const ordered = orderDescByCreatedAt(quizzes);
      return take ? ordered.slice(0, take) : ordered;
    }),
    findFirst: vi.fn(async ({ where }: { where: { id: number; userId: number } }) => {
      const quiz = store.quizzes.find((candidate) => candidate.id === where.id && candidate.userId === where.userId);
      return quiz ? includeQuiz(quiz) : null;
    }),
    create: vi.fn(async ({ data }: { data: { userId: number; quizTopic: string; questions: { create: Array<{ questionText: string; position: number; options: { create: Array<{ optionText: string; position: number; isCorrect: boolean }> } }> } } }) => {
      const quiz = { id: nextId(), userId: data.userId, quizTopic: data.quizTopic, score: null, state: "GENERATED" as const, createdAt: new Date(), updatedAt: new Date() };
      store.quizzes.push(quiz);
      for (const questionData of data.questions.create) {
        const question = { id: nextId(), quizId: quiz.id, questionText: questionData.questionText, position: questionData.position };
        store.quizQuestions.push(question);
        for (const optionData of questionData.options.create) {
          store.quizOptions.push({ id: nextId(), quizQuestionId: question.id, ...optionData });
        }
      }
      return includeQuiz(quiz);
    }),
    update: vi.fn(async ({ where, data }: { where: { id: number }; data: { state: "COMPLETED"; score: number } }) => {
      const quiz = store.quizzes.find((candidate) => candidate.id === where.id);
      if (!quiz) throw new Error("missing quiz");
      quiz.state = data.state;
      quiz.score = data.score;
      quiz.updatedAt = new Date();
      return quiz;
    }),
  },
  quizAnswer: {
    create: vi.fn(async ({ data }: { data: Omit<QuizAnswerRecord, "id" | "createdAt"> }) => {
      const answer = { id: nextId(), ...data, createdAt: new Date() };
      store.quizAnswers.push(answer);
      return answer;
    }),
  },
  studyProgress: {
    upsert: vi.fn(async ({ where, update, create }: { where: { userId: number }; update?: Partial<StudyProgressRecord>; create: Partial<StudyProgressRecord> & { userId: number } }) => {
      let progress = store.studyProgress.find((p) => p.userId === where.userId);
      if (progress) {
          if (update && Object.keys(update).length > 0) {
              Object.assign(progress, update, { updatedAt: new Date() });
          }
          return progress;
      }
      progress = { id: nextId(), completedTopics: 0, totalQuizzes: 0, averageScore: 0, updatedAt: new Date(), ...create };
      store.studyProgress.push(progress);
      return progress;
    }),
  },
  $transaction: vi.fn(async (callback: (tx: typeof prismaMock) => unknown) => callback(prismaMock)),
  $disconnect: vi.fn(async () => undefined),
}));

vi.mock("../src/db/prisma.js", () => ({ prisma: prismaMock }));

const { buildServer } = await import("../src/server.js");

const env = {
  DATABASE_URL: "postgresql://example",
  PORT: 4000,
  NODE_ENV: "test" as const,
  SESSION_SECRET: "test-session-secret-with-enough-length",
  FRONTEND_ORIGINS: "http://localhost:3000",
};

function cookieHeader(setCookies: string[]) {
  return setCookies.map((cookie) => cookie.split(";")[0]).join("; ");
}

function rawCookies(cookies: Array<{ name: string; value: string }>) {
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`);
}

async function registerUser() {
  const app = await buildServer(env);
  const register = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { name: "Ada Student", email: "ada@example.com", password: "Password1!" },
  });
  const csrf = await app.inject({ method: "GET", url: "/auth/csrf", headers: { cookie: cookieHeader(rawCookies(register.cookies)) } });
  const sessionCookies = rawCookies(register.cookies).filter((cookie) => cookie.startsWith("aissistant_session="));
  const cookies = [...sessionCookies, ...rawCookies(csrf.cookies)];
  const csrfToken = JSON.parse(csrf.body).csrfToken as string;
  return { app, cookies, csrfToken };
}

describe("diagram-domain HTTP contract", () => {
  beforeEach(() => {
    store.nextId = 1;
    store.users = [];
    store.sessions = [];
    store.studyQuestions = [];
    store.quizzes = [];
    store.quizQuestions = [];
    store.quizOptions = [];
    store.quizAnswers = [];
    store.studyProgress = [];
    vi.clearAllMocks();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
  });

  it("registers a User with name/email and creates empty Study Progress", async () => {
    const { app } = await registerUser();

    expect(store.users[0]).toMatchObject({ name: "Ada Student", email: "ada@example.com" });
    expect(store.studyProgress[0]).toMatchObject({ completedTopics: 0, totalQuizzes: 0, averageScore: 0 });

    await app.close();
  });

  it("logs in and recovers the User session without exposing the password hash", async () => {
    const { app } = await registerUser();

    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "ADA@example.com", password: "Password1!" },
    });
    const loginBody = JSON.parse(login.body);
    const me = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { cookie: cookieHeader(rawCookies(login.cookies)) },
    });
    const meBody = JSON.parse(me.body);

    expect(login.statusCode).toBe(200);
    expect(loginBody.user).toMatchObject({ name: "Ada Student", email: "ada@example.com" });
    expect(loginBody.student).toMatchObject({ name: "Ada Student", email: "ada@example.com" });
    expect(loginBody.user).not.toHaveProperty("passwordHash");
    expect(loginBody.student).not.toHaveProperty("passwordHash");
    expect(me.statusCode).toBe(200);
    expect(meBody.user).toMatchObject({ name: "Ada Student", email: "ada@example.com" });
    expect(meBody.student).toMatchObject({ name: "Ada Student", email: "ada@example.com" });

    await app.close();
  });

  it("persists a Study Question with its Chatbot Response", async () => {
    const { app, cookies, csrfToken } = await registerUser();

    const response = await app.inject({
      method: "POST",
      url: "/study-questions",
      headers: { cookie: cookieHeader(cookies), "x-csrf-token": csrfToken },
      payload: { questionText: "What is photosynthesis?" },
    });

    expect(response.statusCode).toBe(201);
    expect(JSON.parse(response.body).studyQuestion).toMatchObject({
      questionText: "What is photosynthesis?",
      chatbotResponse: "Study answer: What is photosynthesis?",
    });

    await app.close();
  });

  it("generates a Quiz without exposing correct options before submission", async () => {
    const { app, cookies, csrfToken } = await registerUser();

    const response = await app.inject({
      method: "POST",
      url: "/quizzes",
      headers: { cookie: cookieHeader(cookies), "x-csrf-token": csrfToken },
      payload: { quizTopic: "Algebra", questionCount: 2 },
    });
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(201);
    expect(body.quiz.questions).toHaveLength(2);
    expect(body.quiz.questions[0].options).toHaveLength(4);
    expect(body.quiz.questions[0].options[0]).not.toHaveProperty("isCorrect");

    await app.close();
  });

  it("generates five Quiz Questions by default and rejects counts above ten", async () => {
    const { app, cookies, csrfToken } = await registerUser();

    const defaultQuiz = await app.inject({
      method: "POST",
      url: "/quizzes",
      headers: { cookie: cookieHeader(cookies), "x-csrf-token": csrfToken },
      payload: { quizTopic: "Biology" },
    });
    const tooMany = await app.inject({
      method: "POST",
      url: "/quizzes",
      headers: { cookie: cookieHeader(cookies), "x-csrf-token": csrfToken },
      payload: { quizTopic: "Biology", questionCount: 11 },
    });

    expect(defaultQuiz.statusCode).toBe(201);
    expect(JSON.parse(defaultQuiz.body).quiz.questions).toHaveLength(5);
    expect(tooMany.statusCode).toBe(400);
    expect(JSON.parse(tooMany.body).error.code).toBe("VALIDATION_FAILED");

    await app.close();
  });

  it("submits a full Quiz, returns review data, and updates Study Progress", async () => {
    const { app, cookies, csrfToken } = await registerUser();
    const generated = await app.inject({
      method: "POST",
      url: "/quizzes",
      headers: { cookie: cookieHeader(cookies), "x-csrf-token": csrfToken },
      payload: { quizTopic: "Algebra", questionCount: 2 },
    });
    const quiz = JSON.parse(generated.body).quiz;
    const answers = quiz.questions.map((question: { id: number; options: Array<{ id: number }> }) => ({
      quizQuestionId: question.id,
      selectedOptionId: question.options[0].id,
    }));

    const submitted = await app.inject({
      method: "POST",
      url: `/quizzes/${quiz.id}/submit`,
      headers: { cookie: cookieHeader(cookies), "x-csrf-token": csrfToken },
      payload: { answers },
    });
    const body = JSON.parse(submitted.body);

    expect(submitted.statusCode).toBe(200);
    expect(body.quiz.state).toBe("COMPLETED");
    expect(body.quiz.score).toBe(50);
    expect(body.quiz.questions[0].options[0]).toHaveProperty("isCorrect");
    expect(body.studyProgress).toMatchObject({ completedTopics: 1, totalQuizzes: 1, averageScore: 50 });

    await app.close();
  });

  it("rejects incomplete, invalid, and repeated Quiz submissions", async () => {
    const { app, cookies, csrfToken } = await registerUser();
    const generated = await app.inject({
      method: "POST",
      url: "/quizzes",
      headers: { cookie: cookieHeader(cookies), "x-csrf-token": csrfToken },
      payload: { quizTopic: "Algebra", questionCount: 2 },
    });
    const quiz = JSON.parse(generated.body).quiz;
    const fullAnswers = quiz.questions.map((question: { id: number; options: Array<{ id: number }> }) => ({
      quizQuestionId: question.id,
      selectedOptionId: question.options[0].id,
    }));

    const incomplete = await app.inject({
      method: "POST",
      url: `/quizzes/${quiz.id}/submit`,
      headers: { cookie: cookieHeader(cookies), "x-csrf-token": csrfToken },
      payload: { answers: [fullAnswers[0]] },
    });
    const invalid = await app.inject({
      method: "POST",
      url: `/quizzes/${quiz.id}/submit`,
      headers: { cookie: cookieHeader(cookies), "x-csrf-token": csrfToken },
      payload: { answers: [{ ...fullAnswers[0], selectedOptionId: quiz.questions[1].options[0].id }, fullAnswers[1]] },
    });
    const completed = await app.inject({
      method: "POST",
      url: `/quizzes/${quiz.id}/submit`,
      headers: { cookie: cookieHeader(cookies), "x-csrf-token": csrfToken },
      payload: { answers: fullAnswers },
    });
    const repeated = await app.inject({
      method: "POST",
      url: `/quizzes/${quiz.id}/submit`,
      headers: { cookie: cookieHeader(cookies), "x-csrf-token": csrfToken },
      payload: { answers: fullAnswers },
    });

    expect(JSON.parse(incomplete.body).error.code).toBe("QUIZ_INCOMPLETE");
    expect(JSON.parse(invalid.body).error.code).toBe("QUIZ_OPTION_INVALID");
    expect(completed.statusCode).toBe(200);
    expect(JSON.parse(repeated.body).error.code).toBe("QUIZ_ALREADY_COMPLETED");

    await app.close();
  });

  it("counts repeated Quiz Topics once in Study Progress while averaging all completed Quizzes", async () => {
    const { app, cookies, csrfToken } = await registerUser();

    async function completeQuiz(quizTopic: string, selectedOptionIndex: number) {
      const generated = await app.inject({
        method: "POST",
        url: "/quizzes",
        headers: { cookie: cookieHeader(cookies), "x-csrf-token": csrfToken },
        payload: { quizTopic, questionCount: 2 },
      });
      const quiz = JSON.parse(generated.body).quiz;
      const answers = quiz.questions.map((question: { id: number; options: Array<{ id: number }> }) => ({
        quizQuestionId: question.id,
        selectedOptionId: question.options[selectedOptionIndex].id,
      }));
      const submitted = await app.inject({
        method: "POST",
        url: `/quizzes/${quiz.id}/submit`,
        headers: { cookie: cookieHeader(cookies), "x-csrf-token": csrfToken },
        payload: { answers },
      });

      return JSON.parse(submitted.body).studyProgress;
    }

    await completeQuiz("Algebra", 0);
    const afterRetake = await completeQuiz("Algebra", 1);
    const afterNewTopic = await completeQuiz("Biology", 2);

    expect(afterRetake).toMatchObject({ completedTopics: 1, totalQuizzes: 2, averageScore: 50 });
    expect(afterNewTopic).toMatchObject({ completedTopics: 2, totalQuizzes: 3 });
    expect(afterNewTopic.averageScore).toBeCloseTo(33.333, 3);

    await app.close();
  });

  it("returns recent Conversations, recent Quizzes, and Study Progress from the Student Dashboard", async () => {
    const { app, cookies, csrfToken } = await registerUser();

    await app.inject({
      method: "POST",
      url: "/conversations",
      headers: { cookie: cookieHeader(cookies), "x-csrf-token": csrfToken },
      payload: { title: "Biology Discussion" },
    });
    await app.inject({
      method: "POST",
      url: "/quizzes",
      headers: { cookie: cookieHeader(cookies), "x-csrf-token": csrfToken },
      payload: { quizTopic: "Biology", questionCount: 1 },
    });
    const dashboard = await app.inject({
      method: "GET",
      url: "/dashboard/summary",
      headers: { cookie: cookieHeader(cookies) },
    });
    const body = JSON.parse(dashboard.body);

    expect(dashboard.statusCode).toBe(200);
    expect(body.recentConversations[0]).toMatchObject({ title: "Biology Discussion" });
    expect(body.recentQuizzes[0]).toMatchObject({ quizTopic: "Biology", state: "GENERATED" });
    expect(body.studyProgress).toMatchObject({ completedTopics: 0, totalQuizzes: 0, averageScore: 0 });

    await app.close();
  });
});
