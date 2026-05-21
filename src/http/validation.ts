import type { FastifyRequest } from "fastify";
import type { z } from "zod";

export function parseBody<T extends z.ZodTypeAny>(
  request: FastifyRequest,
  schema: T,
): z.infer<T> {
  return schema.parse(request.body ?? {});
}

export function parseQuery<T extends z.ZodTypeAny>(
  request: FastifyRequest,
  schema: T,
): z.infer<T> {
  return schema.parse(request.query ?? {});
}

export function parseParams<T extends z.ZodTypeAny>(
  request: FastifyRequest,
  schema: T,
): z.infer<T> {
  return schema.parse(request.params ?? {});
}
