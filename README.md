# AIssistant Backend

REST JSON backend for AIssistant, an academic chatbot for students.

## Stack

- Node.js + TypeScript
- Fastify
- Prisma
- PostgreSQL
- HTTP-only cookie sessions with CSRF protection

## Documentation

- [Codebase diagrams](docs/codebase-diagrams.md)
- [Frontend integration guide](docs/frontend-integration.md)
- [Domain glossary](CONTEXT.md)
- GitHub PRD: [#13 Align backend with AIssistant chatbot diagrams](https://github.com/sminemb/AIssistant-backend/issues/13)
- Implementation slices: [#14](https://github.com/sminemb/AIssistant-backend/issues/14) through [#21](https://github.com/sminemb/AIssistant-backend/issues/21)

## Setup

```bash
npm install
cp .env.example .env
createdb aissistant
npm run prisma:generate
npm run prisma:migrate
npm run dev
```

The API runs on `PORT` from `.env`, defaulting to `4000`.

## Verification

```bash
npm run prisma:generate
npx prisma validate
npm run build
npm test
```

The current suite covers the diagram-domain public behavior: Account registration/login/session recovery, Study Questions, Quiz generation, Quiz submission, Quiz Review, Study Progress aggregation, Student Dashboard, provider fallback behavior, and documentation drift checks.

## Environment

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/aissistant?schema=public"
PORT=4000
NODE_ENV=development
SESSION_SECRET="replace-with-a-long-random-secret"
FRONTEND_ORIGINS="http://localhost:3000"
ANTHROPIC_API_KEY=""
ANTHROPIC_MODEL=""
```

`SESSION_SECRET` must be at least 32 characters. In production, `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` must be set before Study Question answering or Quiz generation can succeed.

## API Surface

Routes are unversioned for the MVP backend contract.

- `GET /health`
- `GET /auth/csrf`
- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/me`
- `GET /dashboard/summary`
- `GET /study-questions`
- `POST /study-questions`
- `GET /quizzes`
- `POST /quizzes`
- `GET /quizzes/:quizId`
- `POST /quizzes/:quizId/submit`
- `GET /study-progress`

Unsafe cookie-authenticated methods require the `X-CSRF-Token` header to match the CSRF token issued by `GET /auth/csrf`.

## Stable REST Contract

Handled errors return:

```json
{
  "error": {
    "code": "STABLE_ERROR_CODE",
    "message": "Human-readable message"
  }
}
```

Validation errors use `VALIDATION_FAILED` and include `issues`. Auth and ownership failures use stable codes such as `AUTH_REQUIRED`, `CSRF_TOKEN_INVALID`, `INVALID_CREDENTIALS`, `QUIZ_NOT_FOUND`, `QUIZ_ALREADY_COMPLETED`, `QUIZ_INCOMPLETE`, `QUIZ_OPTION_INVALID`, and `ASSISTANT_PROVIDER_NOT_CONFIGURED`.

### Auth Notes

- Browser clients must use `credentials: "include"`.
- Fetch `GET /auth/csrf` and send the returned token in `X-CSRF-Token` for unsafe methods.
- `POST /auth/register` and `POST /auth/login` issue the session cookie and return `{ student }`.
- Student responses never include `passwordHash`.

### DTOs

`StudentDTO`

```ts
{
  id: number;
  name: string;
  email: string;
  createdAt: string;
}
```

`StudyQuestionDTO`

```ts
{
  id: number;
  studentId: number;
  questionText: string;
  chatbotResponse: string;
  createdAt: string;
}
```

`QuizDTO`

```ts
{
  id: number;
  studentId: number;
  quizTopic: string;
  score: number | null;
  state: "GENERATED" | "COMPLETED";
  createdAt: string;
  updatedAt: string;
  questions?: QuizQuestionDTO[];
}
```

`QuizQuestionDTO`

```ts
{
  id: number;
  quizId: number;
  questionText: string;
  position: number;
  selectedOptionId: number | null;
  isCorrect?: boolean | null;
  options: QuizOptionDTO[];
}
```

`QuizOptionDTO`

```ts
{
  id: number;
  quizQuestionId: number;
  optionText: string;
  position: number;
  isCorrect?: boolean;
}
```

Generated quizzes hide `isCorrect`. Completed quizzes include correctness and the Student's selected options for Quiz Review.

### Quiz Rules

- Quiz generation creates 5 questions by default.
- `questionCount` is optional and must be between 1 and 10.
- Every Quiz Question has exactly 4 Quiz Options.
- Generated Quizzes have `state: "GENERATED"` and `score: null`.
- Completed Quizzes have `state: "COMPLETED"` and a percentage `score`.
- Quiz submission must include exactly one selected option for every question.
- Completed Quizzes are immutable; submit another Quiz for another attempt.
- Generated but unanswered Quizzes do not affect Study Progress.

### Study Progress Rules

- `completedTopics` counts distinct Quiz Topics with at least one completed Quiz.
- `totalQuizzes` counts completed Quizzes.
- `averageScore` averages completed Quiz percentage scores.
- Multiple completed Quizzes for the same Quiz Topic increase `totalQuizzes` and affect `averageScore`, but count once for `completedTopics`.

`StudyProgressDTO`

```ts
{
  id: number;
  studentId: number;
  completedTopics: number;
  totalQuizzes: number;
  averageScore: number;
  updatedAt: string;
}
```

`DashboardSummaryDTO`

```ts
{
  recentStudyQuestions: StudyQuestionDTO[];
  recentQuizzes: QuizDTO[];
  studyProgress: StudyProgressDTO;
}
```

### Request Shapes

`POST /auth/register`

```ts
{
  name: string;
  email: string;
  password: string;
}
```

`POST /study-questions`

```ts
{
  questionText: string;
}
```

`POST /quizzes`

```ts
{
  quizTopic: string;
  questionCount?: number; // default 5, max 10
}
```

`POST /quizzes/:quizId/submit`

```ts
{
  answers: Array<{
    quizQuestionId: number;
    selectedOptionId: number;
  }>;
}
```

Quiz submission requires one answer per Quiz Question. Completed Quizzes are immutable; generate another Quiz for another attempt.
