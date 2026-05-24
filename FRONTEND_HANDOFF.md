# Frontend Handoff Document

## API Endpoints Reference

The following endpoints are available for frontend integration:

### Study Questions
- `GET /study-questions` - List study questions
- `POST /study-questions` - Create a new study question

### Quizzes
- `GET /quizzes` - List all quizzes
- `POST /quizzes` - Generate a new quiz
- `GET /quizzes/:quizId` - Get a specific quiz
- `POST /quizzes/:quizId/submit` - Submit quiz answers

### Study Progress
- `GET /study-progress` - Get study progress summary

## Authentication Endpoints
- `GET /auth/csrf` - Get CSRF token
- `POST /auth/register` - Register a new user
- `POST /auth/login` - Log in
- `POST /auth/logout` - Log out
- `GET /auth/me` - Get current user

## Dashboard
- `GET /dashboard/summary` - Get dashboard summary with recent questions, quizzes, and progress