CREATE TABLE IF NOT EXISTS "SystemLog" (
    "log_id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "action" VARCHAR(100) NOT NULL,
    "details" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemLog_pkey" PRIMARY KEY ("log_id")
);

CREATE INDEX IF NOT EXISTS "SystemLog_user_id_idx" ON "SystemLog"("user_id");
CREATE INDEX IF NOT EXISTS "SystemLog_created_at_idx" ON "SystemLog"("created_at");

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'SystemLog_user_id_fkey') THEN
        ALTER TABLE "SystemLog" ADD CONSTRAINT "SystemLog_user_id_fkey" 
        FOREIGN KEY ("user_id") REFERENCES "User"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
