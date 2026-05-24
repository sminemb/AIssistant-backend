# AIssistant Backend

**Backend Repository**: [AIssistant-backend](https://github.com/sminemb/AIssistant-backend)  
**Frontend Repository**: [AIssistant-frontend](https://github.com/carlotata/AIssistant) 

REST JSON backend for AIssistant, an academic chatbot for students powered by Google's Gemini AI models.

## Stack

- Node.js + TypeScript
- Fastify
- Prisma
- PostgreSQL
- Google Gemini API
- HTTP-only cookie sessions with CSRF protection

## Documentation

- [Frontend integration guide](docs/frontend-integration.md)
- [Domain glossary](CONTEXT.md)

---

## Security
- **Rate-Limiting**: Global (100 req/min) and Authentication-specific (5 req/min) limits enabled via `@fastify/rate-limit`.
- **Input Validation**: Strict schema enforcement using `Zod` on all API endpoints.
- **CSRF Protection**: Token-based protection for all unsafe HTTP methods.
- **CORS**: Restricted origins with explicit header and method handling.

---

# Setup
Clone the repository: 
```bash
git clone https://github.com/sminemb/AIssistant-backend.git
```
## 1. Install dependencies

```bash
npm install
cp .env.example .env
createdb aissistant
npm run prisma:generate
npm run prisma:migrate
npm run dev
```

The API runs on `PORT` from `.env`, defaulting to `4000`.

---

# Verification

```bash
npm run prisma:generate
npx prisma validate
npm run build
npm test
```

The current suite covers:

- Account registration
- Login/session recovery
- Study Questions
- Quiz generation
- Quiz submission
- Quiz Review
- Study Progress aggregation
- Student Dashboard
- Gemini provider fallback behavior
- Documentation drift checks

---

# Environment

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/aissistant?schema=public"
PORT=4000
NODE_ENV=development
SESSION_SECRET="replace-with-a-long-random-secret"
FRONTEND_ORIGINS="http://localhost:3000"
GEMINI_API_KEY=""
GEMINI_MODEL=""
```

## Environment Notes

- `SESSION_SECRET` must be at least 32 characters.
- In production, `GEMINI_API_KEY` must be configured before Study Question answering or Quiz generation can succeed.
- The backend automatically falls back across multiple Gemini models if the preferred model fails or becomes rate-limited.
- `GEMINI_MODEL` is optional. If omitted, the backend uses `gemini-2.5-flash`.

---

# API Surface

Routes are unversioned for the MVP backend contract.

## Health

- `GET /health`

## Authentication

- `GET /auth/csrf`
- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/me`

## Dashboard

- `GET /dashboard/summary`

## Study Questions

- `GET /study-questions`
- `POST /study-questions`

## Quizzes

- `GET /quizzes`
- `POST /quizzes`
- `GET /quizzes/:quizId`
- `POST /quizzes/:quizId/submit`

## Study Progress

- `GET /study-progress`

Unsafe cookie-authenticated methods require the `X-CSRF-Token` header to match the CSRF token issued by `GET /auth/csrf`.

---

# Stable REST Contract

Handled errors return:

```json
{
  "error": {
    "code": "STABLE_ERROR_CODE",
    "message": "Human-readable message"
  }
}
```

Validation errors use `VALIDATION_FAILED` and include `issues`.

Auth and ownership failures use stable codes such as:

- `AUTH_REQUIRED`
- `CSRF_TOKEN_INVALID`
- `INVALID_CREDENTIALS`
- `QUIZ_NOT_FOUND`
- `QUIZ_ALREADY_COMPLETED`
- `QUIZ_INCOMPLETE`
- `QUIZ_OPTION_INVALID`
- `ASSISTANT_PROVIDER_NOT_CONFIGURED`
- `ASSISTANT_PROVIDER_FAILED`
- `ASSISTANT_PROVIDER_INVALID_RESPONSE`

---

# Auth Notes

- Browser clients must use `credentials: "include"`.
- Fetch `GET /auth/csrf` and send the returned token in `X-CSRF-Token` for unsafe methods.
- `POST /auth/register` and `POST /auth/login` issue the session cookie and return `{ user, student }`.
- User responses never include `passwordHash`.

---

# DTOs

## UserDTO

```ts
{
  id: number;
  name: string;
  email: string;
  role: "STUDENT" | "ADMIN";
  createdAt: string;
}
```

## StudyQuestionDTO

```ts
{
  id: number;
  userId: number;
  questionText: string;
  chatbotResponse: string;
  createdAt: string;
}
```

## QuizDTO

```ts
{
  id: number;
  userId: number;
  quizTopic: string;
  score: number | null;
  state: "GENERATED" | "COMPLETED";
  createdAt: string;
  updatedAt: string;
  questions?: QuizQuestionDTO[];
}
```

## QuizQuestionDTO

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

## QuizOptionDTO

```ts
{
  id: number;
  quizQuestionId: number;
  optionText: string;
  position: number;
  isCorrect?: boolean;
}
```

Generated quizzes hide `isCorrect`.

Completed quizzes include correctness and the student's selected options for Quiz Review.

---

# Quiz Rules

- Quiz generation creates 5 questions by default.
- `questionCount` is optional and must be between 1 and 10.
- Every Quiz Question has exactly 4 Quiz Options.
- Generated Quizzes have `state: "GENERATED"` and `score: null`.
- Completed Quizzes have `state: "COMPLETED"` and a percentage `score`.
- Quiz submission must include exactly one selected option for every question.
- Completed Quizzes are immutable.
- Submit another Quiz for another attempt.
- Generated but unanswered Quizzes do not affect Study Progress.

---

# Study Progress Rules

- `completedTopics` counts distinct Quiz Topics with at least one completed Quiz.
- `totalQuizzes` counts completed Quizzes.
- `averageScore` averages completed Quiz percentage scores.
- Multiple completed Quizzes for the same Quiz Topic increase `totalQuizzes` and affect `averageScore`, but count once for `completedTopics`.

## StudyProgressDTO

```ts
{
  id: number;
  userId: number;
  completedTopics: number;
  totalQuizzes: number;
  averageScore: number;
  updatedAt: string;
}
```

## DashboardSummaryDTO

```ts
{
  recentStudyQuestions: StudyQuestionDTO[];
  recentQuizzes: QuizDTO[];
  studyProgress: StudyProgressDTO;
}
```

---

# Request Shapes

## POST /auth/register

```ts
{
  name: string;
  email: string;
  password: string;
}
```

## POST /study-questions

```ts
{
  questionText: string;
}
```

## POST /quizzes

```ts
{
  quizTopic: string;
  questionCount?: number; // default 5, max 10
}
```

## POST /quizzes/:quizId/submit

```ts
{
  answers: Array<{
    quizQuestionId: number;
    selectedOptionId: number;
  }>;
}
```

Quiz submission requires one answer per Quiz Question.

Completed Quizzes are immutable.

Generate another Quiz for another attempt.

---

# Gemini Model Fallback

The backend supports automatic Gemini model fallback.

If the preferred Gemini model fails, becomes unavailable, or hits a rate limit, the backend automatically retries using the next available Gemini model.

Supported fallback models:

```ts
[
  "gemini-3.1-pro-preview",
  "gemini-3-flash-preview",
  "gemini-3.1-flash-lite-preview",
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite"
]
```

Default model:

```ts
"gemini-2.5-flash"
```
