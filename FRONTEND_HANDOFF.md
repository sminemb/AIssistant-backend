# Frontend Handoff Document

This document provides a comprehensive reference for the AIssistant API endpoints, request bodies, and response structures.

## Base URL
All API requests are relative to the server root (e.g., `http://localhost:3000`).

## Authentication & Session Management

All endpoints (except registration, login, and CSRF) require an active session cookie (`session`). CSRF protection is enabled for all non-GET requests.

### CSRF Protection
- `GET /auth/csrf`
  - **Response:** `{ "csrfToken": "string" }`
  - **Usage:** Call this before any POST/PATCH/DELETE request. Include the token in the `X-CSRF-Token` header.

### Student Authentication
- `POST /auth/register`
  - **Body:** `{ "email": "string", "password": "string", "name": "string" }`
  - **Response:** `201 Created` with user data. Sets session cookie.
- `POST /auth/login`
  - **Body:** `{ "email": "string", "password": "string", "role": "STUDENT" | "ADMIN" (optional) }`
  - **Response:** `200 OK` with user data. Sets session cookie.
- `POST /auth/logout`
  - **Response:** `204 No Content`. Clears session and CSRF cookies.
- `GET /auth/me`
  - **Response:** `200 OK` with the current user's data if authenticated.

## Student Features

### Dashboard
- `GET /dashboard/summary`
  - **Response:** Returns the 5 most recent Study Questions, 5 most recent Quizzes, and the current Study Progress.

### Study Questions
- `GET /study-questions`
  - **Response:** `{ "studyQuestions": [...] }` (sorted by newest first).
- `POST /study-questions`
  - **Body:** `{ "questionText": "string" }`
  - **Response:** `201 Created` with the `{ "studyQuestion": { "id", "questionText", "chatbotResponse", ... } }`.

### Quizzes
- `GET /quizzes`
  - **Response:** `{ "quizzes": [...] }` (sorted by newest first).
- `POST /quizzes`
  - **Body:** `{ "quizTopic": "string", "questionCount": number (1-10, default 5) }`
  - **Response:** `201 Created` with the quiz structure. **Correct answers are hidden.**
- `GET /quizzes/:quizId`
  - **Response:** The quiz structure. If `state` is `COMPLETED`, includes correctness and selected answers.
- `POST /quizzes/:quizId/submit`
  - **Body:** `{ "answers": [ { "quizQuestionId": number, "selectedOptionId": number }, ... ] }`
  - **Response:** `200 OK` with the `{ "quiz", "studyProgress" }`.

### Study Progress
- `GET /study-progress`
  - **Response:** `{ "studyProgress": { "completedTopics", "totalQuizzes", "averageScore", ... } }`.

## Admin Features

Requires an active session with `ADMIN` role.

### Admin CSRF
- `GET /admin/csrf`
  - **Response:** `{ "csrfToken": "string" }`

### User Management
- `GET /admin/users`
  - **Response:** `{ "users": [...] }` (List of all users with basic info).
- `POST /admin/create`
  - **Body:** `{ "email": "string", "password": "string", "name": "string" }` (Creates a new ADMIN user).
- `PATCH /admin/users/:userId`
  - **Body:** `{ "name": "string" (optional), "email": "string" (optional) }`
- `PATCH /admin/users/:userId/role`
  - **Body:** `{ "role": "STUDENT" | "ADMIN" }`
- `DELETE /admin/users/:userId`
- `POST /admin/promote`
  - **Body:** `{ "userId": number }` (Promotes a STUDENT to ADMIN).

## Common Error Codes
- `401 UNAUTHORIZED`: Missing or invalid session.
- `403 ACCESS_DENIED`: Insufficient privileges (e.g., student accessing admin routes).
- `404 NOT_FOUND`: Resource (quiz, user) does not exist.
- `409 CONFLICT`: e.g., Email already registered, Quiz already completed.
- `400 BAD_REQUEST/VALIDATION_ERROR`: Missing or malformed request body/parameters.
