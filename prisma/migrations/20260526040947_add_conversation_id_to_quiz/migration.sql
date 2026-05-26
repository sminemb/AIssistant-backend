-- AlterTable
ALTER TABLE "Quiz" ADD COLUMN     "conversation_id" INTEGER;

-- CreateIndex
CREATE INDEX "Quiz_conversation_id_idx" ON "Quiz"("conversation_id");

-- AddForeignKey
ALTER TABLE "Quiz" ADD CONSTRAINT "Quiz_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "Conversation"("conversation_id") ON DELETE SET NULL ON UPDATE NO ACTION;
