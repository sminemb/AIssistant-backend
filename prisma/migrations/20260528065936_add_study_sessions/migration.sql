-- CreateTable
CREATE TABLE "StudySession" (
    "session_id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudySession_pkey" PRIMARY KEY ("session_id")
);

-- CreateIndex
CREATE INDEX "StudySession_user_id_idx" ON "StudySession"("user_id");

-- AddForeignKey
ALTER TABLE "StudySession" ADD CONSTRAINT "StudySession_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
