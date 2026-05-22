# AIssistant Backend

Separate REST JSON backend for AIssistant, an academic study assistant for students.

## Stack

- Node.js + TypeScript
- Fastify
- Prisma
- PostgreSQL
- HTTP-only cookie sessions

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

## Database

AIssistant uses PostgreSQL through Prisma. For local development, create a database that matches `DATABASE_URL`:

```bash
createdb aissistant
npm run prisma:generate
npm run prisma:migrate
```

`npm run prisma:migrate` applies the checked-in migrations in development and creates new migrations when the schema changes. In CI, staging, or production, apply checked-in migrations without creating new files:

```bash
npm run prisma:generate
npm run prisma:deploy
```

## Environment

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/aissistant?schema=public"
PORT=4000
NODE_ENV=development
SESSION_SECRET="replace-with-a-long-random-secret"
FRONTEND_ORIGINS="http://localhost:3000"
ANTHROPIC_API_KEY=""
```

`SESSION_SECRET` must be at least 32 characters.

## API Surface

- `GET /health`
- `GET /auth/csrf`
- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/me`
- `GET /courses`
- `POST /courses`
- `PATCH /courses/:courseId`
- `POST /courses/:courseId/archive`
- `GET /tasks`
- `POST /tasks`
- `PATCH /tasks/:taskId`
- `POST /tasks/:taskId/complete`
- `POST /tasks/:taskId/reopen`
- `DELETE /tasks/:taskId`
- `GET /today-tasks`
- `POST /today-tasks`
- `DELETE /today-tasks/:taskId`
- `GET /dashboard/summary`
- `GET /conversations`
- `POST /conversations`
- `GET /conversations/:conversationId`
- `DELETE /conversations/:conversationId`
- `POST /conversations/:conversationId/messages`
- `POST /suggested-tasks/:suggestedTaskId/confirm`
- `POST /suggested-tasks/:suggestedTaskId/dismiss`

Unsafe cookie-authenticated methods require the `X-CSRF-Token` header to match the CSRF token issued by `GET /auth/csrf`.
