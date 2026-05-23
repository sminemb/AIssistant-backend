# Frontend Integration Guide

This backend now follows the diagram-domain MVP: Students register/login, ask Study Questions, generate and answer multiple-choice Quizzes, and view Study Progress.

## Integration Shape

- Local backend base URL: `http://localhost:4000` unless `PORT` changes.
- Routes are unversioned. Do not call `/v1/...`.
- Browser requests need `credentials: "include"`.
- Unsafe methods need `X-CSRF-Token` from `GET /auth/csrf`.
- `GET /auth/me` is the source of truth for logged-in Student state.
- Production AI routes require `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL`; missing config returns `ASSISTANT_PROVIDER_NOT_CONFIGURED`.

## Recommended Slice Order

1. Auth/session and `/auth/me`
2. Student Dashboard
3. Study Questions
4. Quiz generation
5. Quiz submission and Study Progress

## Endpoints

- `POST /auth/register` -> `{ student }`
- `POST /auth/login` -> `{ student }`
- `POST /auth/logout` -> `204`
- `GET /auth/me` -> `{ student }`
- `GET /dashboard/summary` -> `{ recentStudyQuestions, recentQuizzes, studyProgress }`
- `GET /study-questions` -> `{ studyQuestions }`
- `POST /study-questions` -> `{ studyQuestion }`
- `GET /quizzes` -> `{ quizzes }`
- `POST /quizzes` -> `{ quiz }`
- `GET /quizzes/:quizId` -> `{ quiz }`
- `POST /quizzes/:quizId/submit` -> `{ quiz, studyProgress }`
- `GET /study-progress` -> `{ studyProgress }`

## Quiz Rules

- Quizzes are multiple-choice only.
- `POST /quizzes` generates 5 questions by default.
- `questionCount` is optional and capped at 10.
- Each Quiz Question has exactly 4 options.
- Generated Quiz responses hide which option is correct.
- Completed Quiz responses show correctness for review.
- A Quiz can be submitted only once.
- Submission must include one selected option for every Quiz Question.
- Only completed Quizzes update Study Progress.

## Study Progress Rules

`StudyProgress` is one stored aggregate per Student:

- `completedTopics`: distinct Quiz Topics with at least one completed Quiz.
- `totalQuizzes`: number of completed Quizzes.
- `averageScore`: average percentage score across completed Quizzes.

Generated but unanswered Quizzes do not affect Study Progress.
