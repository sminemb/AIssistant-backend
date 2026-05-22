# Frontend Integration Guide

This guide records the intended future integration path between the existing Next.js frontend and the AIssistant backend.

## Integration Shape

The frontend integrates at runtime by calling the backend REST JSON API as an external service. The backend remains a separate service.

## Order

Integrate incrementally by vertical slice:

1. Auth/session and `/auth/me`
2. Dashboard Summary
3. Task and Today's Tasks mutations
4. Conversations and Messages
5. Suggested Task confirmation and dismissal

Keep each slice small enough to verify against real backend responses before moving to the next one. Do not begin with broad client state rewrites or a general sync layer.

## Auth and CSRF

- Use `credentials: "include"` for backend requests.
- Use `/auth/me` as the source of truth for logged-in Student state.
- Fetch `/auth/csrf` and keep the returned token in memory.
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

## API Contract

- Backend-owned DTOs are the source of truth.
- API names should use domain terms from `CONTEXT.md`.
- Frontend display text may stay user-friendly even when API fields use domain names.
- Stable backend error codes are part of the contract and should map to frontend messages.

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

### Dashboard Summary

Use Dashboard Summary as the first authenticated read after session recovery. It is intentionally shaped for the landing screen and uses backend domain names: `dueSoonTasks`, `todaysTasks`, `progress`, and `latestConversation`.

### Task and Today's Tasks mutations

For create, edit, complete, reopen, delete, select, and unselect flows, update the visible UI optimistically only when there is a clear rollback/refetch path. If the backend returns an `ErrorEnvelope`, show the mapped message and restore the previous UI state or refetch the relevant read model.

### Conversations and Messages

`POST /conversations/:conversationId/messages` returns the Student Message, Assistant Message, and any pending Suggested Tasks synchronously. V1 does not stream assistant responses.

### Suggested Tasks

Pending Suggested Tasks stay tied to their Conversation. Confirmation creates a real Task and marks the Suggested Task confirmed; dismissal marks it dismissed. Repeated confirmation or dismissal returns a stable conflict.

## Likely Frontend Touchpoints

These are guidance, not mandates. Paths may change before integration starts.

- Dashboard data source currently using hard-coded data.
- Task toggle handler.
- Chat submit and quick action handlers.
- Auth shell for login/register and `/auth/me` loading.
- Error display/mapping layer.
