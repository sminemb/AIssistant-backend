CREATE TYPE "QuizState" AS ENUM ('GENERATED', 'COMPLETED');
CREATE TYPE "UserRole" AS ENUM ('STUDENT', 'ADMIN');

CREATE TABLE "User" (
    "user_id" SERIAL NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'STUDENT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_pkey" PRIMARY KEY ("user_id")
);

CREATE TABLE "Session" (
    "session_id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_pkey" PRIMARY KEY ("session_id")
);

CREATE TABLE "StudyQuestion" (
    "question_id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "question_text" TEXT NOT NULL,
    "chatbot_response" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StudyQuestion_pkey" PRIMARY KEY ("question_id")
);

CREATE TABLE "Quiz" (
    "quiz_id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "quiz_topic" VARCHAR(200) NOT NULL,
    "score" DOUBLE PRECISION,
    "state" "QuizState" NOT NULL DEFAULT 'GENERATED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Quiz_pkey" PRIMARY KEY ("quiz_id")
);

CREATE TABLE "QuizQuestion" (
    "quiz_question_id" SERIAL NOT NULL,
    "quiz_id" INTEGER NOT NULL,
    "question_text" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    CONSTRAINT "QuizQuestion_pkey" PRIMARY KEY ("quiz_question_id")
);

CREATE TABLE "QuizOption" (
    "quiz_option_id" SERIAL NOT NULL,
    "quiz_question_id" INTEGER NOT NULL,
    "option_text" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "is_correct" BOOLEAN NOT NULL,
    CONSTRAINT "QuizOption_pkey" PRIMARY KEY ("quiz_option_id")
);

CREATE TABLE "QuizAnswer" (
    "quiz_answer_id" SERIAL NOT NULL,
    "quiz_id" INTEGER NOT NULL,
    "quiz_question_id" INTEGER NOT NULL,
    "selected_option_id" INTEGER NOT NULL,
    "is_correct" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QuizAnswer_pkey" PRIMARY KEY ("quiz_answer_id")
);

CREATE TABLE "StudyProgress" (
    "progress_id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "completed_topics" INTEGER NOT NULL DEFAULT 0,
    "total_quizzes" INTEGER NOT NULL DEFAULT 0,
    "average_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StudyProgress_pkey" PRIMARY KEY ("progress_id")
);

CREATE TABLE "Conversation" (
    "conversation_id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("conversation_id")
);

CREATE TABLE "SystemLog" (
    "log_id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "action" VARCHAR(100) NOT NULL,
    "details" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SystemLog_pkey" PRIMARY KEY ("log_id")
);

CREATE TABLE "Message" (
    "message_id" SERIAL NOT NULL,
    "conversation_id" INTEGER NOT NULL,
    "role" VARCHAR(20) NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Message_pkey" PRIMARY KEY ("message_id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "Session_token_hash_key" ON "Session"("token_hash");
CREATE INDEX "Session_user_id_idx" ON "Session"("user_id");
CREATE INDEX "Session_expires_at_idx" ON "Session"("expires_at");
CREATE INDEX "StudyQuestion_user_id_idx" ON "StudyQuestion"("user_id");
CREATE INDEX "StudyQuestion_user_id_created_at_idx" ON "StudyQuestion"("user_id", "created_at");
CREATE INDEX "Quiz_user_id_idx" ON "Quiz"("user_id");
CREATE INDEX "Quiz_user_id_state_idx" ON "Quiz"("user_id", "state");
CREATE INDEX "Quiz_user_id_quiz_topic_idx" ON "Quiz"("user_id", "quiz_topic");
CREATE INDEX "QuizQuestion_quiz_id_idx" ON "QuizQuestion"("quiz_id");
CREATE UNIQUE INDEX "QuizQuestion_quiz_id_position_key" ON "QuizQuestion"("quiz_id", "position");
CREATE INDEX "QuizOption_quiz_question_id_idx" ON "QuizOption"("quiz_question_id");
CREATE UNIQUE INDEX "QuizOption_quiz_question_id_position_key" ON "QuizOption"("quiz_question_id", "position");
CREATE UNIQUE INDEX "QuizAnswer_quiz_question_id_key" ON "QuizAnswer"("quiz_question_id");
CREATE INDEX "QuizAnswer_quiz_id_idx" ON "QuizAnswer"("quiz_id");
CREATE INDEX "QuizAnswer_selected_option_id_idx" ON "QuizAnswer"("selected_option_id");
CREATE UNIQUE INDEX "StudyProgress_user_id_key" ON "StudyProgress"("user_id");
CREATE INDEX "Conversation_user_id_idx" ON "Conversation"("user_id");
CREATE INDEX "Message_conversation_id_idx" ON "Message"("conversation_id");
CREATE INDEX "SystemLog_user_id_idx" ON "SystemLog"("user_id");
CREATE INDEX "SystemLog_created_at_idx" ON "SystemLog"("created_at");

ALTER TABLE "Session" ADD CONSTRAINT "Session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("user_id") ON DELETE CASCADE;
ALTER TABLE "StudyQuestion" ADD CONSTRAINT "StudyQuestion_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("user_id") ON DELETE CASCADE;
ALTER TABLE "Quiz" ADD CONSTRAINT "Quiz_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("user_id") ON DELETE CASCADE;
ALTER TABLE "QuizQuestion" ADD CONSTRAINT "QuizQuestion_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "Quiz"("quiz_id") ON DELETE CASCADE;
ALTER TABLE "QuizOption" ADD CONSTRAINT "QuizOption_quiz_question_id_fkey" FOREIGN KEY ("quiz_question_id") REFERENCES "QuizQuestion"("quiz_question_id") ON DELETE CASCADE;
ALTER TABLE "QuizAnswer" ADD CONSTRAINT "QuizAnswer_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "Quiz"("quiz_id") ON DELETE CASCADE;
ALTER TABLE "QuizAnswer" ADD CONSTRAINT "QuizAnswer_quiz_question_id_fkey" FOREIGN KEY ("quiz_question_id") REFERENCES "QuizQuestion"("quiz_question_id") ON DELETE CASCADE;
ALTER TABLE "QuizAnswer" ADD CONSTRAINT "QuizAnswer_selected_option_id_fkey" FOREIGN KEY ("selected_option_id") REFERENCES "QuizOption"("quiz_option_id") ON DELETE RESTRICT;
ALTER TABLE "StudyProgress" ADD CONSTRAINT "StudyProgress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("user_id") ON DELETE CASCADE;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("user_id") ON DELETE CASCADE;
ALTER TABLE "SystemLog" ADD CONSTRAINT "SystemLog_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("user_id") ON DELETE SET NULL;
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "Conversation"("conversation_id") ON DELETE CASCADE;
