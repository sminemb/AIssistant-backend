# Frontend Integration Guide

This backend exposes an unversioned REST JSON contract for the AIssistant student experience.

## Authentication

Browser clients should send requests with `credentials: "include"`.

Use `GET /auth/csrf` to receive a CSRF token and send it as `X-CSRF-Token` for unsafe authenticated methods: `POST`, `PATCH`, `PUT`, and `DELETE`.

- `GET /auth/csrf`
- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/me`

Register and login responses return `{ user, student }` for frontend compatibility. Both fields contain the same safe user payload: `id`, `name`, `email`, `role`, and `createdAt`; they never include `passwordHash`.

## Student Dashboard

- `GET /dashboard/summary`

Returns recent Study Questions, recent Quizzes, and Study Progress for the authenticated user.

## Study Questions

- `GET /study-questions`
- `POST /study-questions`

Create request:

```ts
{
  questionText: string;
}
```

The response stores the student's `questionText` with the AI-generated `chatbotResponse`.

## Quizzes

- `GET /quizzes`
- `POST /quizzes`
- `GET /quizzes/:quizId`
- `POST /quizzes/:quizId/submit`

Create request:

```ts
{
  quizTopic: string;
  questionCount?: number;
}
```

`questionCount` defaults to 5 and is capped at 10. Generated quizzes hide option correctness until the quiz is submitted.

Submit request:

```ts
{
  answers: Array<{
    quizQuestionId: number;
    selectedOptionId: number;
  }>;
}
```

Submission requires one answer for every Quiz Question. Completed quizzes are immutable and include review data with selected options and correctness.

## Study Progress

- `GET /study-progress`

Study Progress summarizes completed quiz topics, total completed quizzes, and average score. Generated but unanswered quizzes do not affect progress.
