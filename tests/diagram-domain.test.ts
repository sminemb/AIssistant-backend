import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type StudentRecord = {
  id: number;
  name: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
};

type SessionRecord = {
  id: number;
  studentId: number;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
};

type StudyQuestionRecord = {
  id: number;
  studentId: number;
  questionText: string;
  chatbotResponse: string;
  createdAt: Date;
};

type QuizRecord = {
  id: number;
  studentId: number;
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
  studentId: number;
  completedTopics: number;
  totalQuizzes: number;
  averageScore: number;
  updatedAt: Date;
};

const store = vi.hoisted(() => ({
  nextId: 1,
  students: [] as StudentRecord[],
  sessions: [] as SessionRecord[],
  studyQuestions: [] as StudyQuestionRecord[],
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

function updateProgress(studentId: number) {
  const completed = store.quizzes.filter((quiz) => quiz.studentId === studentId && quiz.state === "COMPLETED");
  const completedTopics = new Set(completed.map((quiz) => quiz.quizTopic.toLowerCase())).size;
  const totalQuizzes = completed.length;
  const averageScore =
    totalQuizzes === 0 ? 0 : completed.reduce((total, quiz) => total + (quiz.score ?? 0), 0) / totalQuizzes;
  let progress = store.studyProgress.find((candidate) => candidate.studentId === studentId);

  if (!progress) {
    progress = { id: nextId(), studentId, completedTopics, totalQuizzes, averageScore, updatedAt: new Date() };
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
  student: {
    findUnique: vi.fn(async ({ where }: { where: { email?: string } }) =>
      where.email ? store.students.find((student) => student.email === where.email) ?? null : null,
    ),
    create: vi.fn(async ({ data }: { data: { email: string; passwordHash: string; name: string; studyProgress?: unknown } }) => {
      const student = {
        id: nextId(),
        email: data.email,
        passwordHash: data.passwordHash,
        name: data.name,
        createdAt: new Date(),
      };
      store.students.push(student);
      if (data.studyProgress) {
        store.studyProgress.push({
          id: nextId(),
          studentId: student.id,
          completedTopics: 0,
          totalQuizzes: 0,
          averageScore: 0,
          updatedAt: new Date(),
        });
      }
      return student;
    }),
  },
  session: {
    create: vi.fn(async ({ data }: { data: { studentId: number; tokenHash: string; expiresAt: Date } }) => {
      const session = { id: nextId(), studentId: data.studentId, tokenHash: data.tokenHash, expiresAt: data.expiresAt, revokedAt: null, createdAt: new Date() };
      store.sessions.push(session);
      return session;
    }),
    findUnique: vi.fn(async ({ where }: { where: { tokenHash: string }; include?: { student?: boolean } }) => {
      const session = store.sessions.find((candidate) => candidate.tokenHash === where.tokenHash);
      return session ? { ...session, student: store.students.find((student) => student.id === session.studentId) ?? null } : null;
    }),
    updateMany: vi.fn(async () => ({ count: 0 })),
  },
  studyQuestion: {
    findMany: vi.fn(async ({ where }: { where: { studentId: number } }) =>
      orderDescByCreatedAt(store.studyQuestions.filter((question) => question.studentId === where.studentId)),
    ),
    create: vi.fn(async ({ data }: { data: { studentId: number; questionText: string; chatbotResponse: string } }) => {
      const studyQuestion = { id: nextId(), ...data, createdAt: new Date() };
      store.studyQuestions.push(studyQuestion);
      return studyQuestion;
    }),
  },
  quiz: {
    findMany: vi.fn(async ({ where, take }: { where: { studentId: number; state?: "COMPLETED"; score?: { not: null } }; take?: number }) => {
      let quizzes = store.quizzes.filter((quiz) => quiz.studentId === where.studentId);
      if (where.state) quizzes = quizzes.filter((quiz) => quiz.state === where.state);
      if (where.score) quizzes = quizzes.filter((quiz) => quiz.score !== null);
      const ordered = orderDescByCreatedAt(quizzes);
      return take ? ordered.slice(0, take) : ordered;
    }),
    findFirst: vi.fn(async ({ where }: { where: { id: number; studentId: number } }) => {
      const quiz = store.quizzes.find((candidate) => candidate.id === where.id && candidate.studentId === where.studentId);
      return quiz ? includeQuiz(quiz) : null;
    }),
    create: vi.fn(async ({ data }: { data: { studentId: number; quizTopic: string; questions: { create: Array<{ questionText: string; position: number; options: { create: Array<{ optionText: string; position: number; isCorrect: boolean }> } }> } } }) => {
      const quiz = { id: nextId(), studentId: data.studentId, quizTopic: data.quizTopic, score: null, state: "GENERATED" as const, createdAt: new Date(), updatedAt: new Date() };
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
    upsert: vi.fn(async ({ where, update, create }: { where: { studentId: number }; update?: Partial<StudyProgressRecord>; create: Partial<StudyProgressRecord> & { studentId: number } }) => {
      const existing = store.studyProgress.find((progress) => progress.studentId === where.studentId);
      if (existing) {
        if (update && Object.keys(update).length > 0) {
          Object.assign(existing, update, { updatedAt: new Date() });
        }
        return existing;
      }
      const progress = { id: nextId(), completedTopics: 0, totalQuizzes: 0, averageScore: 0, updatedAt: new Date(), ...create };
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

async function registerStudent() {
  const app = await buildServer(env);
  const register = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { name: "Ada Student", email: "ada@example.com", password: "correct horse battery staple" },
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
    store.students = [];
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

  it("registers a Student with name/email and creates empty Study Progress", async () => {
    const { app } = await registerStudent();

    expect(store.students[0]).toMatchObject({ name: "Ada Student", email: "ada@example.com" });
    expect(store.studyProgress[0]).toMatchObject({ completedTopics: 0, totalQuizzes: 0, averageScore: 0 });

    await app.close();
  });

  it("persists a Study Question with its Chatbot Response", async () => {
    const { app, cookies, csrfToken } = await registerStudent();

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
    const { app, cookies, csrfToken } = await registerStudent();

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

  it("submits a full Quiz, returns review data, and updates Study Progress", async () => {
    const { app, cookies, csrfToken } = await registerStudent();
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
});
