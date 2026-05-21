import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  SESSION_SECRET: z.string().min(32),
  FRONTEND_ORIGINS: z.string().default("http://localhost:3000"),
  ANTHROPIC_API_KEY: z.string().optional(),
});

export type AppEnv = z.infer<typeof envSchema>;

export function readEnv(): AppEnv {
  return envSchema.parse(process.env);
}

export function frontendOrigins(env: AppEnv): string[] {
  return env.FRONTEND_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}
