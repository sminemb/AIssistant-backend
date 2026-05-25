-- CreateTable
CREATE TABLE "StudyQuestion" (
    "question_id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "question_text" TEXT NOT NULL,
    "chatbot_response" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudyQuestion_pkey" PRIMARY KEY ("question_id")
);

-- CreateIndex
CREATE INDEX "StudyQuestion_user_id_idx" ON "StudyQuestion"("user_id");

-- CreateIndex
CREATE INDEX "StudyQuestion_user_id_created_at_idx" ON "StudyQuestion"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "StudyQuestion" ADD CONSTRAINT "StudyQuestion_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
