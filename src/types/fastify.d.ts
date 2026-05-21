import type { Student } from "@prisma/client";
import type { FastifyReply, FastifyRequest } from "fastify";

declare module "fastify" {
  interface FastifyRequest {
    student: Student | null;
  }

  interface FastifyInstance {
    requireStudent(request: FastifyRequest): Promise<Student>;
    issueCsrfToken(request: FastifyRequest, reply: FastifyReply): Promise<string>;
  }
}
