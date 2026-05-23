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
