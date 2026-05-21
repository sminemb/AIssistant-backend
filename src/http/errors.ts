import type { FastifyReply } from "fastify";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function sendError(reply: FastifyReply, error: unknown) {
  if (error instanceof HttpError) {
    return reply.status(error.statusCode).send({
      error: { code: error.code, message: error.message },
    });
  }

  if (error instanceof ZodError) {
    return reply.status(400).send({
      error: { code: "VALIDATION_FAILED", message: "Request validation failed", issues: error.issues },
    });
  }

  throw error;
}
