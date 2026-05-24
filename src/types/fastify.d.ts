import type { User } from "@prisma/client";
import type { FastifyReply, FastifyRequest } from "fastify";

declare module "fastify" {
  interface FastifyRequest {
    user: User | null;
  }

  interface FastifyInstance {
    requireUser(request: FastifyRequest): Promise<User>;
    requireAdmin(request: FastifyRequest): Promise<User>;
    issueCsrfToken(request: FastifyRequest, reply: FastifyReply): Promise<string>;
  }
}