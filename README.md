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
ANTHROPIC_MODEL=""
```

`SESSION_SECRET` must be at least 32 characters.
In production, `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` must be set before assistant Message creation can succeed. Non-AI routes remain available if assistant provider configuration is missing.

## API Surface

Routes are unversioned for the v1 backend contract. Do not add a `/v1` prefix unless a later ADR changes the route strategy.

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

## Stable REST Contract

Backend response DTOs and error codes are the source of truth for frontend integration. Date-time values are ISO strings in JSON. Date-only fields use `YYYY-MM-DD` semantics when sent by clients and are returned as serialized date values by the backend.

### ErrorEnvelope

All handled errors return:

```json
{
  "error": {
    "code": "STABLE_ERROR_CODE",
    "message": "Human-readable message"
  }
}
```

Validation errors use `VALIDATION_FAILED` and include an `issues` array. Auth and ownership failures use stable codes such as `AUTH_REQUIRED`, `CSRF_INVALID`, `INVALID_CREDENTIALS`, `COURSE_NOT_FOUND`, `TASK_NOT_FOUND`, `CONVERSATION_NOT_FOUND`, `SUGGESTED_TASK_NOT_FOUND`, `TASK_TITLE_EXISTS`, and `SUGGESTED_TASK_NOT_PENDING`.

### DTOs

`StudentDTO`

```ts
{
  id: string;
  email: string;
  displayName: string;
  timezone: string;
  avatarColor: string | null;
}
```

`CourseDTO`

```ts
{
  id: string;
  studentId: string;
  name: string;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
```

`TaskDTO`

```ts
{
  id: string;
  studentId: string;
  courseId: string | null;
  title: string;
  notes: string | null;
  dueDateKind: "DATE_ONLY" | "DATE_TIME" | null;
  dueDate: string | null;
  dueAt: string | null;
  completedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  course?: CourseDTO | null;
}
```

`TodayTaskDTO`

```ts
{
  id: string;
  studentId: string;
  taskId: string;
  day: string;
  createdAt: string;
  task: TaskDTO;
}
```

Today's Tasks are explicit Student selections, not tasks due today. `GET /dashboard/summary` returns flattened `todaysTasks: TaskDTO[]` for the authenticated landing page. Direct `/today-tasks` routes return selection records so clients can inspect the selected day and selected Task relationship.

`MessageDTO`

```ts
{
  id: string;
  studentId: string;
  conversationId: string;
  author: "STUDENT" | "ASSISTANT";
  content: string;
  createdAt: string;
}
```

`SuggestedTaskDTO`

```ts
{
  id: string;
  studentId: string;
  conversationId: string;
  courseId: string | null;
  createdTaskId: string | null;
  title: string;
  notes: string | null;
  dueDateKind: "DATE_ONLY" | "DATE_TIME" | null;
  dueDate: string | null;
  dueAt: string | null;
  state: "PENDING" | "CONFIRMED" | "DISMISSED";
  createdAt: string;
  updatedAt: string;
  course?: CourseDTO | null;
  createdTask?: TaskDTO | null;
}
```

`ConversationDTO`

```ts
{
  id: string;
  studentId: string;
  courseId: string | null;
  title: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  course?: CourseDTO | null;
  messages?: MessageDTO[];
  suggestedTasks?: SuggestedTaskDTO[];
}
```

`DashboardSummaryDTO`

```ts
{
  studentDay: string;
  dueSoonThrough: string;
  dueSoonTasks: TaskDTO[];
  todaysTasks: TaskDTO[];
  progress: Array<{
    day: string;
    completedTasks: number;
    byCourse: Array<{
      courseId: string | null;
      courseName: string | null;
      completedTasks: number;
    }>;
  }>;
  latestConversation: ConversationDTO | null;
}
```

### Response Envelopes

- Auth routes return `{ student: StudentDTO }`, except logout returns `204`.
- Course routes return `{ course: CourseDTO }` or `{ courses: CourseDTO[] }`.
- Task routes return `{ task: TaskDTO }`, `{ tasks: TaskDTO[] }`, or `204` for delete/unselect.
- Today's Tasks routes return `{ todayTasks: TodayTaskDTO[] }` for reads and `{ todayTask: TodayTaskDTO }` for selection.
- Dashboard Summary returns `DashboardSummaryDTO`.
- Conversation routes return `{ conversation: ConversationDTO }` or `{ conversations: ConversationDTO[] }`.
- `POST /conversations/:conversationId/messages` returns `{ studentMessage: MessageDTO, assistantMessage: MessageDTO, suggestedTasks: SuggestedTaskDTO[] }` synchronously.
- Suggested Task confirmation returns `{ task: TaskDTO, suggestedTask: SuggestedTaskDTO }`; dismissal returns `{ suggestedTask: SuggestedTaskDTO }`.
