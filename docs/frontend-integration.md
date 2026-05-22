# Frontend Integration Guide

This guide is the handoff for the frontend team starting runtime integration with the AIssistant backend. Frontend work should happen in the frontend repo/app; backend-only work should continue to avoid frontend edits. Do not edit the frontend as part of backend-only work.

## Integration Shape

The frontend integrates at runtime by calling the backend REST JSON API as an external service. The backend remains a separate service and owns auth, persistence, DTOs, error codes, and domain API names.

- Local backend base URL: `http://localhost:4000` unless `PORT` changes.
- Routes are unversioned. Do not call `/v1/...`.
- Browser cookie/CORS integration requires the frontend origin to be listed in backend `FRONTEND_ORIGINS`.
- Treat `README.md` as the route and DTO reference until an OpenAPI spec or generated client exists.
- Use domain names in client data models where practical: Student, Course, Task, Due Soon, Today's Tasks, Conversation, Message, Suggested Task.

## Order

Integrate incrementally by vertical slice:

1. Auth/session and `/auth/me`
2. Dashboard Summary
3. Task and Today's Tasks mutations
4. Conversations and Messages
5. Suggested Task confirmation and dismissal

Keep each slice small enough to verify against real backend responses before moving to the next one. Do not begin with broad client state rewrites or a general sync layer.

## Local Setup Contract

Backend prerequisites:

```bash
npm install
cp .env.example .env
npm run prisma:generate
npm run prisma:migrate
npm run dev
```

Frontend-relevant backend env:

```env
PORT=4000
FRONTEND_ORIGINS="http://localhost:3000"
```

If the frontend dev server uses a different origin, add it to `FRONTEND_ORIGINS`, comma-separated. Production assistant messages require `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL`; if those are missing, non-AI routes still work and assistant Message creation returns `ASSISTANT_PROVIDER_NOT_CONFIGURED`.

## Auth and CSRF

- Use `credentials: "include"` for backend requests.
- Use `/auth/me` as the source of truth for logged-in Student state.
- Fetch `/auth/csrf` and keep the returned token in memory. The backend also sets a CSRF cookie, but frontend code should send the returned token in the header.
- Send `X-CSRF-Token` for unsafe requests.
- If the backend returns `CSRF_TOKEN_INVALID`, refetch `/auth/csrf` before retrying appropriate actions.
- Treat a `401 AUTH_REQUIRED` response from `/auth/me` as logged out.

Example request shape:

```ts
await fetch(`${backendUrl}/tasks`, {
  method: "POST",
  credentials: "include",
  headers: {
    "content-type": "application/json",
    "x-csrf-token": csrfToken,
  },
  body: JSON.stringify({ title: "Read chapter 8" }),
});
```

Recommended frontend helper shape:

```ts
type ApiError = {
  error: {
    code: string;
    message: string;
    issues?: unknown[];
  };
};

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${backendUrl}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...init.headers,
    },
  });

  if (response.status === 204) return undefined as T;

  const body = await response.json();
  if (!response.ok) throw body as ApiError;
  return body as T;
}
```

## API Contract

- Backend-owned DTOs are the source of truth.
- API names should use domain terms from `CONTEXT.md`.
- Frontend display text may stay user-friendly even when API fields use domain names.
- Stable backend error codes are part of the contract and should map to frontend messages.
- The backend returns `ErrorEnvelope` for handled errors: `{ error: { code, message, issues? } }`.
- Validation errors use `VALIDATION_FAILED`.
- Unknown routes use `ROUTE_NOT_FOUND`.

## State

- Real Student accounts start empty.
- Use development-only sample data when a populated local account is needed for integration demos.
- Do not assume production or newly registered Student accounts contain Courses, Tasks, Conversations, Messages, or Suggested Tasks.
- `/dashboard` remains the authenticated landing screen.
- Dashboard Summary is the authenticated landing read model.
- Fetch `GET /dashboard/summary` after `/auth/me` succeeds to populate Due Soon Tasks, Today's Tasks, Progress, and the latest Conversation summary.
- Optimistic Task UI is allowed for Task mutations, but backend responses are authoritative.
- On backend error, rollback the optimistic Task UI state or refetch the focused resource such as `/tasks`, `/today-tasks`, or `/dashboard/summary`.
- V1 has no general sync endpoint.
- V1 uses synchronous assistant Message posting, not streaming.

## Slice Notes

### Auth/session

Wire login, register, logout, and `/auth/me` first. Every browser request that should carry the session cookie needs `credentials: "include"`. Unsafe methods need the `X-CSRF-Token` header from `/auth/csrf`.

Endpoints:

- `POST /auth/register` -> `{ student }`
- `POST /auth/login` -> `{ student }`
- `GET /auth/me` -> `{ student }` or `401 AUTH_REQUIRED`
- `GET /auth/csrf` -> CSRF token response and cookie
- `POST /auth/logout` -> `204`

Acceptance checks:

- Refreshing the frontend preserves logged-in state through `/auth/me`.
- Login/register responses do not expose `passwordHash`.
- Unsafe requests without `X-CSRF-Token` show a recoverable CSRF error path.

### Dashboard Summary

Use Dashboard Summary as the first authenticated read after session recovery. It is intentionally shaped for the landing screen and uses backend domain names: `dueSoonTasks`, `todaysTasks`, `progress`, and `latestConversation`.

Endpoint:

- `GET /dashboard/summary` -> `DashboardSummaryDTO`

Frontend guidance:

- Load this after `/auth/me` succeeds.
- Use `dueSoonTasks` for priority work. This includes overdue incomplete Tasks and Tasks due within the backend's Due Soon window.
- Use `todaysTasks` for the focus list. These are explicit Student selections, not tasks whose Due Date is today.
- Empty arrays are valid for new Student accounts.

### Task and Today's Tasks mutations

For create, edit, complete, reopen, delete, select, and unselect flows, update the visible UI optimistically only when there is a clear rollback/refetch path. If the backend returns an `ErrorEnvelope`, show the mapped message and restore the previous UI state or refetch the relevant read model.

Endpoints:

- `GET /tasks`
- `POST /tasks`
- `PATCH /tasks/:taskId`
- `POST /tasks/:taskId/complete`
- `POST /tasks/:taskId/reopen`
- `DELETE /tasks/:taskId`
- `GET /today-tasks?day=YYYY-MM-DD`
- `POST /today-tasks`
- `DELETE /today-tasks/:taskId?day=YYYY-MM-DD`

Important shape note:

- `GET /dashboard/summary` returns flattened `todaysTasks: TaskDTO[]`.
- Direct `/today-tasks` routes return selection records:
  - read: `{ todayTasks: Array<{ id, studentId, taskId, day, createdAt, task: TaskDTO }> }`
  - select: `{ todayTask: { id, studentId, taskId, day, createdAt, task: TaskDTO } }`
- Prefer `GET /dashboard/summary` for landing-page Today's Tasks. Use direct `/today-tasks` routes when the UI needs to mutate or inspect explicit selections.

Common stable errors:

- `TASK_NOT_FOUND`
- `TASK_DELETED`
- `TASK_TITLE_EXISTS`
- `COURSE_NOT_FOUND`

### Conversations and Messages

`POST /conversations/:conversationId/messages` returns the Student Message, Assistant Message, and any pending Suggested Tasks synchronously. V1 does not stream assistant responses.

Endpoints:

- `GET /conversations`
- `POST /conversations`
- `GET /conversations/:conversationId`
- `DELETE /conversations/:conversationId`
- `POST /conversations/:conversationId/messages`

Frontend guidance:

- Create or select a Conversation before sending a Message.
- Append the returned `studentMessage` and `assistantMessage` from the same response.
- Show returned `suggestedTasks` immediately if non-empty.
- If assistant provider config is missing in an environment, Message creation returns `503 ASSISTANT_PROVIDER_NOT_CONFIGURED`; show a non-destructive chat error and keep the Conversation usable.

### Suggested Tasks

Pending Suggested Tasks stay tied to their Conversation. Confirmation creates a real Task and marks the Suggested Task confirmed; dismissal marks it dismissed. Repeated confirmation or dismissal returns a stable conflict.

Endpoints:

- `POST /suggested-tasks/:suggestedTaskId/confirm` -> `{ task, suggestedTask }`
- `POST /suggested-tasks/:suggestedTaskId/dismiss` -> `{ suggestedTask }`

Frontend guidance:

- Pending Suggested Tasks should remain visible after refresh when the Conversation is read.
- On confirm, add or refetch the created Task and mark the suggestion confirmed.
- On dismiss, remove it from pending UI while preserving history if the Conversation view shows past suggestions.
- Handle `SUGGESTED_TASK_NOT_PENDING` as an already-handled conflict.

## Likely Frontend Touchpoints

These are guidance, not mandates. Paths may change before integration starts.

- Dashboard data source currently using hard-coded data.
- Task toggle handler.
- Chat submit and quick action handlers.
- Auth shell for login/register and `/auth/me` loading.
- Error display/mapping layer.

## First Week Checklist

- Confirm backend base URL and frontend origin are configured.
- Wire a shared fetch/client helper with `credentials: "include"`.
- Implement `/auth/me` bootstrapping and logged-out handling.
- Implement CSRF token fetch and unsafe-method header injection.
- Replace dashboard mock data with `GET /dashboard/summary`.
- Add frontend error mapping for at least `AUTH_REQUIRED`, `CSRF_TOKEN_INVALID`, `VALIDATION_FAILED`, `TASK_TITLE_EXISTS`, `TASK_DELETED`, `SUGGESTED_TASK_NOT_PENDING`, and `ASSISTANT_PROVIDER_NOT_CONFIGURED`.
- Decide whether local sample data comes from a seed script, a shared dev account, or manual setup.
