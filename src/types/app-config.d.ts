import type { AppEnv } from "../config/env.js";

declare module "fastify" {
  interface FastifyInstance {
    config: AppEnv;
  }
}
