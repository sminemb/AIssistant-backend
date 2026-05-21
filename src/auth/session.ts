import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import type { PrismaClient, Student } from "@prisma/client";

export const sessionCookieName = "aissistant_session";
export const csrfCookieName = "aissistant_csrf";
export const sessionTtlMs = 1000 * 60 * 60 * 24 * 14;

export function newOpaqueToken() {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(prisma: PrismaClient, studentId: string) {
  const token = newOpaqueToken();
  const expiresAt = new Date(Date.now() + sessionTtlMs);

  await prisma.session.create({
    data: {
      studentId,
      tokenHash: hashToken(token),
      expiresAt,
    },
  });

  return { token, expiresAt };
}

export async function readSessionStudent(
  prisma: PrismaClient,
  token: string | undefined,
): Promise<Student | null> {
  if (!token) {
    return null;
  }

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { student: true },
  });

  if (!session || session.revokedAt || session.expiresAt <= new Date()) {
    return null;
  }

  return session.student;
}

export async function revokeSession(prisma: PrismaClient, token: string | undefined) {
  if (!token) {
    return;
  }

  await prisma.session.updateMany({
    where: { tokenHash: hashToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export function safeEqual(left: string | undefined, right: string | undefined) {
  if (!left || !right) {
    return false;
  }

  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function publicStudent(student: Student) {
  return {
    id: student.id,
    email: student.email,
    displayName: student.displayName,
    timezone: student.timezone,
    avatarColor: student.avatarColor,
    createdAt: student.createdAt,
    updatedAt: student.updatedAt,
  };
}
