# AIssistant Codebase Diagrams

These diagrams describe the backend after the diagram-domain correction.

## Use Case Diagram

```mermaid
flowchart LR
  Student([Student])

  subgraph Backend["AIssistant Backend"]
    Register([Register Account])
    Login([Login Account])
    Ask([Ask Study Questions])
    GenerateQuiz([Generate Quiz])
    AnswerQuiz([Answer Quiz])
    TrackProgress([Track Study Progress])
    Dashboard([View Student Dashboard])
  end

  Student --> Register
  Student --> Login
  Student --> Ask
  Student --> GenerateQuiz
  Student --> AnswerQuiz
  Student --> TrackProgress
  Student --> Dashboard

  GenerateQuiz --> AnswerQuiz
  AnswerQuiz --> TrackProgress
  Ask --> Dashboard
  TrackProgress --> Dashboard
```

## Persistence ERD

```mermaid
erDiagram
  Student ||--o{ Session : owns
  Student ||--o{ StudyQuestion : asks
  Student ||--o{ Quiz : generates
  Student ||--|| StudyProgress : tracks

  Quiz ||--o{ QuizQuestion : contains
  QuizQuestion ||--o{ QuizOption : offers
  QuizQuestion ||--o| QuizAnswer : receives
  QuizOption ||--o{ QuizAnswer : selected_as
  Quiz ||--o{ QuizAnswer : records

  Student {
    int student_id PK
    string name
    string email UK
    string password_hash
    datetime created_at
  }

  Session {
    int session_id PK
    int student_id FK
    string token_hash UK
    datetime expires_at
    datetime revoked_at
    datetime created_at
  }

  StudyQuestion {
    int question_id PK
    int student_id FK
    string question_text
    string chatbot_response
    datetime created_at
  }

  Quiz {
    int quiz_id PK
    int student_id FK
    string quiz_topic
    float score
    string state
    datetime created_at
    datetime updated_at
  }

  QuizQuestion {
    int quiz_question_id PK
    int quiz_id FK
    string question_text
    int position
  }

  QuizOption {
    int quiz_option_id PK
    int quiz_question_id FK
    string option_text
    int position
    boolean is_correct
  }

  QuizAnswer {
    int quiz_answer_id PK
    int quiz_id FK
    int quiz_question_id FK
    int selected_option_id FK
    boolean is_correct
    datetime created_at
  }

  StudyProgress {
    int progress_id PK
    int student_id FK
    int completed_topics
    int total_quizzes
    float average_score
    datetime updated_at
  }
```

## Activity Diagram

```mermaid
flowchart TD
  Start((Start))
  Open[Open AIssistant]
  HasAccount{Has account?}
  Register[Register Account]
  Login[Login Account]
  Dashboard[Access Student Dashboard]
  Choose{Choose action}

  EnterQuestion[Enter Study Question]
  GenerateResponse[Generate Chatbot Response]
  SaveQuestion[Save Study Question]

  SelectTopic[Select Quiz Topic]
  GenerateQuiz[Generate Quiz Questions and Options]
  AnswerQuiz[Answer all Quiz Questions]
  CalculateScore[Calculate Quiz Score]
  UpdateProgress[Update Study Progress]

  ViewProgress[View Study Progress]
  End((End))

  Start --> Open
  Open --> HasAccount
  HasAccount -- No --> Register
  HasAccount -- Yes --> Login
  Register --> Login
  Login --> Dashboard
  Dashboard --> Choose

  Choose -- Ask Study Question --> EnterQuestion
  EnterQuestion --> GenerateResponse
  GenerateResponse --> SaveQuestion
  SaveQuestion --> Dashboard

  Choose -- Generate Quiz --> SelectTopic
  SelectTopic --> GenerateQuiz
  GenerateQuiz --> AnswerQuiz
  AnswerQuiz --> CalculateScore
  CalculateScore --> UpdateProgress
  UpdateProgress --> Dashboard

  Choose -- Track Progress --> ViewProgress
  ViewProgress --> End
```

## Backend Route And Module Architecture

```mermaid
flowchart LR
  Client[Frontend Client]

  subgraph Fastify["Fastify Server"]
    AuthRoutes[Auth Routes]
    StudyQuestionRoutes[Study Question Routes]
    QuizRoutes[Quiz Routes]
    StudyProgressRoutes[Study Progress Routes]
    DashboardRoutes[Dashboard Routes]
    AuthPlugin[Session and CSRF Plugin]
    ErrorHandler[Error Handler]
  end

  subgraph Domain["Domain Services"]
    AssistantProvider[AI Provider Boundary]
    QuizScoring[Quiz Scoring]
    ProgressAggregate[Study Progress Aggregate]
  end

  Prisma[Prisma Client]
  Postgres[(PostgreSQL)]
  Anthropic[Anthropic API]

  Client --> Fastify
  Fastify --> AuthPlugin
  Fastify --> ErrorHandler
  Fastify --> AuthRoutes
  Fastify --> StudyQuestionRoutes
  Fastify --> QuizRoutes
  Fastify --> StudyProgressRoutes
  Fastify --> DashboardRoutes

  StudyQuestionRoutes --> AssistantProvider
  QuizRoutes --> AssistantProvider
  QuizRoutes --> QuizScoring
  QuizRoutes --> ProgressAggregate

  AuthRoutes --> Prisma
  StudyQuestionRoutes --> Prisma
  QuizRoutes --> Prisma
  StudyProgressRoutes --> Prisma
  DashboardRoutes --> Prisma
  AssistantProvider --> Anthropic
  Prisma --> Postgres
```

## Endpoint Map

```mermaid
flowchart TB
  subgraph Public["Public"]
    Health["GET /health"]
    Csrf["GET /auth/csrf"]
    Register["POST /auth/register"]
    Login["POST /auth/login"]
  end

  subgraph Authenticated["Authenticated"]
    Logout["POST /auth/logout"]
    Me["GET /auth/me"]
    Dashboard["GET /dashboard/summary"]
    StudyQuestions["GET/POST /study-questions"]
    Quizzes["GET/POST /quizzes"]
    QuizDetail["GET /quizzes/:quizId"]
    SubmitQuiz["POST /quizzes/:quizId/submit"]
    StudyProgress["GET /study-progress"]
  end

  Public --> Authenticated
  StudyQuestions --> Dashboard
  Quizzes --> QuizDetail
  QuizDetail --> SubmitQuiz
  SubmitQuiz --> StudyProgress
  StudyProgress --> Dashboard
```
