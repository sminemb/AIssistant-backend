-- CreateEnum
CREATE TYPE "QuizDifficulty" AS ENUM ('easy', 'medium', 'hard');

-- AlterTable
ALTER TABLE "Quiz" ADD COLUMN "difficulty" "QuizDifficulty" NOT NULL DEFAULT 'medium';