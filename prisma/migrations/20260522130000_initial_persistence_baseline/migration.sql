-- CreateEnum
CREATE TYPE "QuizState" AS ENUM ('GENERATED', 'COMPLETED');

-- CreateTable
CREATE TABLE "Student" (
    "student_id" SERIAL NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Student_pkey" PRIMARY KEY ("student_id")
);

-- CreateTable
CREATE TABLE "Session" (
    "session_id" SERIAL NOT NULL,
    "student_id" INTEGER NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("session_id")
);

-- CreateTable
CREATE TABLE "StudyQuestion" (
    "question_id" SERIAL NOT NULL,
    "student_id" INTEGER NOT NULL,
    "question_text" TEXT NOT NULL,
    "chatbot_response" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudyQuestion_pkey" PRIMARY KEY ("question_id")
);

-- CreateTable
CREATE TABLE "Quiz" (
    "quiz_id" SERIAL NOT NULL,
    "student_id" INTEGER NOT NULL,
    "quiz_topic" VARCHAR(200) NOT NULL,
    "score" DOUBLE PRECISION,
    "state" "QuizState" NOT NULL DEFAULT 'GENERATED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quiz_pkey" PRIMARY KEY ("quiz_id")
);

-- CreateTable
CREATE TABLE "QuizQuestion" (
    "quiz_question_id" SERIAL NOT NULL,
    "quiz_id" INTEGER NOT NULL,
    "question_text" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "QuizQuestion_pkey" PRIMARY KEY ("quiz_question_id")
);

-- CreateTable
CREATE TABLE "QuizOption" (
    "quiz_option_id" SERIAL NOT NULL,
    "quiz_question_id" INTEGER NOT NULL,
    "option_text" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "is_correct" BOOLEAN NOT NULL,

    CONSTRAINT "QuizOption_pkey" PRIMARY KEY ("quiz_option_id")
);

-- CreateTable
CREATE TABLE "QuizAnswer" (
    "quiz_answer_id" SERIAL NOT NULL,
    "quiz_id" INTEGER NOT NULL,
    "quiz_question_id" INTEGER NOT NULL,
    "selected_option_id" INTEGER NOT NULL,
    "is_correct" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuizAnswer_pkey" PRIMARY KEY ("quiz_answer_id")
);

-- CreateTable
CREATE TABLE "StudyProgress" (
    "progress_id" SERIAL NOT NULL,
    "student_id" INTEGER NOT NULL,
    "completed_topics" INTEGER NOT NULL DEFAULT 0,
    "total_quizzes" INTEGER NOT NULL DEFAULT 0,
    "average_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudyProgress_pkey" PRIMARY KEY ("progress_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Student_email_key" ON "Student"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_hash_key" ON "Session"("token_hash");

-- CreateIndex
CREATE INDEX "Session_student_id_idx" ON "Session"("student_id");

-- CreateIndex
CREATE INDEX "Session_expires_at_idx" ON "Session"("expires_at");

-- CreateIndex
CREATE INDEX "StudyQuestion_student_id_idx" ON "StudyQuestion"("student_id");

-- CreateIndex
CREATE INDEX "StudyQuestion_student_id_created_at_idx" ON "StudyQuestion"("student_id", "created_at");

-- CreateIndex
CREATE INDEX "Quiz_student_id_idx" ON "Quiz"("student_id");

-- CreateIndex
CREATE INDEX "Quiz_student_id_state_idx" ON "Quiz"("student_id", "state");

-- CreateIndex
CREATE INDEX "Quiz_student_id_quiz_topic_idx" ON "Quiz"("student_id", "quiz_topic");

-- CreateIndex
CREATE UNIQUE INDEX "QuizQuestion_quiz_id_position_key" ON "QuizQuestion"("quiz_id", "position");

-- CreateIndex
CREATE INDEX "QuizQuestion_quiz_id_idx" ON "QuizQuestion"("quiz_id");

-- CreateIndex
CREATE UNIQUE INDEX "QuizOption_quiz_question_id_position_key" ON "QuizOption"("quiz_question_id", "position");

-- CreateIndex
CREATE INDEX "QuizOption_quiz_question_id_idx" ON "QuizOption"("quiz_question_id");

-- CreateIndex
CREATE UNIQUE INDEX "QuizAnswer_quiz_question_id_key" ON "QuizAnswer"("quiz_question_id");

-- CreateIndex
CREATE INDEX "QuizAnswer_quiz_id_idx" ON "QuizAnswer"("quiz_id");

-- CreateIndex
CREATE INDEX "QuizAnswer_selected_option_id_idx" ON "QuizAnswer"("selected_option_id");

-- CreateIndex
CREATE UNIQUE INDEX "StudyProgress_student_id_key" ON "StudyProgress"("student_id");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "Student"("student_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyQuestion" ADD CONSTRAINT "StudyQuestion_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "Student"("student_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quiz" ADD CONSTRAINT "Quiz_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "Student"("student_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizQuestion" ADD CONSTRAINT "QuizQuestion_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "Quiz"("quiz_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizOption" ADD CONSTRAINT "QuizOption_quiz_question_id_fkey" FOREIGN KEY ("quiz_question_id") REFERENCES "QuizQuestion"("quiz_question_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizAnswer" ADD CONSTRAINT "QuizAnswer_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "Quiz"("quiz_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizAnswer" ADD CONSTRAINT "QuizAnswer_quiz_question_id_fkey" FOREIGN KEY ("quiz_question_id") REFERENCES "QuizQuestion"("quiz_question_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizAnswer" ADD CONSTRAINT "QuizAnswer_selected_option_id_fkey" FOREIGN KEY ("selected_option_id") REFERENCES "QuizOption"("quiz_option_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyProgress" ADD CONSTRAINT "StudyProgress_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "Student"("student_id") ON DELETE CASCADE ON UPDATE CASCADE;
