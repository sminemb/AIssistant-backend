import bcrypt from "bcryptjs";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { csrfCookieName } from "../auth/session.js";
import { prisma } from "../db/prisma.js";
import { HttpError } from "../http/errors.js";
import { parseBody } from "../http/validation.js";

const createAdminSchema = z.object({
  email: z.string().email().transform((value) => value.toLowerCase()),
  password: z.string().min(8),
  name: z.string().trim().min(1).max(120),
});

const promoteAdminSchema = z.object({
  userId: z.number().int().positive(),
});

export async function adminRoutes(app: FastifyInstance) {
  app.get("/admin/csrf", async (request, reply) => {
    const csrfToken = await app.issueCsrfToken(request, reply);
    return { csrfToken };
  });

  app.get("/admin/users", async (request) => {
    const currentAdmin = await app.requireAdmin(request);

    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return { users };
  });

  app.get("/admin/logs", async (request) => {
    await app.requireAdmin(request);
    const logs = await prisma.systemLog.findMany({
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return { logs };
  });

  app.get("/admin/logs/:userId", async (request) => {
    await app.requireAdmin(request);
    const paramsSchema = z.object({
      userId: z.string().transform(Number),
    });
    const { userId } = paramsSchema.parse(request.params);
    const logs = await prisma.systemLog.findMany({
      where: { userId },
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
    });
    return { logs };
  });

  app.post("/admin/create", async (request) => {
    await app.requireAdmin(request);

    const body = parseBody(request, createAdminSchema);
    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) {
      throw new HttpError(409, "EMAIL_ALREADY_REGISTERED", "A user with this email already exists");
    }

    const passwordHash = await bcrypt.hash(body.password, 10);
    const user = await prisma.user.create({
      data: { email: body.email, passwordHash, name: body.name, role: "ADMIN" },
    });

    await prisma.systemLog.create({
        data: { userId: user.id, action: `Admin created user: ${body.email}` }
    });

    return { user: { id: user.id, name: user.name, email: user.email, role: user.role, createdAt: user.createdAt } };
  });

  app.patch("/admin/users/:userId", async (request) => {
    await app.requireAdmin(request);

    const paramsSchema = z.object({
      userId: z.string().transform(Number),
    });
    const { userId } = paramsSchema.parse(request.params);

    const updateBodySchema = z.object({
      name: z.string().trim().min(1).max(120).optional(),
      email: z.string().email().transform((value) => value.toLowerCase()).optional(),
    });
    const body = parseBody(request, updateBodySchema);

    if (Object.keys(body).length === 0) {
      throw new HttpError(400, "NO_CHANGES", "No fields to update provided.");
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new HttpError(404, "USER_NOT_FOUND", "User not found");
    }
    
    // Check if new email already exists for another user
    if (body.email && body.email !== user.email) {
      const existingUserWithEmail = await prisma.user.findUnique({
        where: { email: body.email },
      });
      if (existingUserWithEmail && existingUserWithEmail.id !== userId) {
        throw new HttpError(409, "EMAIL_ALREADY_REGISTERED", "A user with this email already exists.");
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: body,
    });

    await prisma.systemLog.create({
      data: { userId, action: `Admin updated user profile: ${updatedUser.email}` }
    });

    return { user: { id: updatedUser.id, name: updatedUser.name, email: updatedUser.email, role: updatedUser.role, createdAt: updatedUser.createdAt } };
  });

  app.patch("/admin/users/:userId/role", async (request) => {
    const currentAdmin = await app.requireAdmin(request);

    const paramsSchema = z.object({
      userId: z.string().transform(Number),
    });
    const { userId } = paramsSchema.parse(request.params);

    const roleBodySchema = z.object({
      role: z.enum(["STUDENT", "ADMIN"]),
    });
    const { role: newRole } = parseBody(request, roleBodySchema);

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new HttpError(404, "USER_NOT_FOUND", "User not found");
    }

    if (newRole === "STUDENT") {
      const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
      if (adminCount <= 1) {
        throw new HttpError(403, "CANNOT_DEMOTE_LAST_ADMIN", "Cannot demote the last administrator.");
      }
    }

    if (user.id === currentAdmin.id && newRole === "STUDENT") {
      throw new HttpError(403, "CANNOT_DEMOTE_SELF", "You cannot demote yourself.");
    }
    
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { role: newRole },
    });

    await prisma.systemLog.create({
      data: { userId, action: `Admin changed user role to: ${newRole}` }
    });

    return { user: { id: updatedUser.id, name: updatedUser.name, email: updatedUser.email, role: updatedUser.role, createdAt: updatedUser.createdAt } };
  });

  app.delete("/admin/users/:userId", async (request) => {
    const currentAdmin = await app.requireAdmin(request);

    const paramsSchema = z.object({
      userId: z.string().transform(Number),
    });
    const { userId } = paramsSchema.parse(request.params);

    const userToDelete = await prisma.user.findUnique({ where: { id: userId } });
    if (!userToDelete) {
      throw new HttpError(404, "USER_NOT_FOUND", "User not found");
    }

    if (userToDelete.role === "ADMIN") {
      const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
      if (adminCount <= 1) {
        throw new HttpError(403, "CANNOT_DELETE_LAST_ADMIN", "Cannot delete the last administrator.");
      }
    }

    if (userToDelete.id === currentAdmin.id) {
      throw new HttpError(403, "CANNOT_DELETE_SELF", "You cannot delete your own account.");
    }

    const userEmail = userToDelete.email;
    await prisma.user.delete({ where: { id: userId } });

    await prisma.systemLog.create({
      data: { userId: currentAdmin.id, action: `Admin deleted user: ${userEmail}` }
    });

    return { message: "User deleted successfully" };
  });

  app.post("/admin/promote", async (request) => {
    await app.requireAdmin(request);

    const body = parseBody(request, promoteAdminSchema);
    const user = await prisma.user.findUnique({ where: { id: body.userId } });
    if (!user) {
      throw new HttpError(404, "USER_NOT_FOUND", "User not found");
    }

    if (user.role === "ADMIN") {
      throw new HttpError(409, "ALREADY_ADMIN", "This user is already an admin");
    }

    const updatedUser = await prisma.user.update({
      where: { id: body.userId },
      data: { role: "ADMIN" },
    });

    return { user: { id: updatedUser.id, name: updatedUser.name, email: updatedUser.email, role: updatedUser.role, createdAt: updatedUser.createdAt } };
  });
}
