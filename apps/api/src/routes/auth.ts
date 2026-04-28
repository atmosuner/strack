import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { hashPassword, verifyPassword } from "../lib/password.js";
import { getPrisma } from "../db.js";
import { createHouseholdWithOwner } from "../services/householdBootstrap.js";

const registerBody = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  householdName: z.string().min(1).max(200),
});

const loginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post("/register", async (request, reply) => {
    const parse = registerBody.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({
        error: { code: "BadRequest", message: parse.error.message },
      });
    }

    const { email, password, householdName } = parse.data;
    const norm = normalizeEmail(email);

    const prisma = getPrisma();
    const existing = await prisma.user.findUnique({ where: { email: norm } });
    if (existing) {
      return reply.status(409).send({
        error: { code: "Conflict", message: "Email already registered" },
      });
    }

    const passwordHash = await hashPassword(password);
    const { userId, householdId } = await createHouseholdWithOwner({
      email: norm,
      householdName,
      passwordHash,
    });

    const token = await reply.jwtSign({
      sub: userId,
      email: norm,
    });

    return { token, userId, householdId };
  });

  app.post("/login", async (request, reply) => {
    const parse = loginBody.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({
        error: { code: "BadRequest", message: parse.error.message },
      });
    }

    const norm = normalizeEmail(parse.data.email);
    const prisma = getPrisma();
    const user = await prisma.user.findUnique({ where: { email: norm } });
    if (!user?.passwordHash) {
      return reply.status(401).send({
        error: { code: "Unauthorized", message: "Invalid email or password" },
      });
    }
    const ok = await verifyPassword(parse.data.password, user.passwordHash);
    if (!ok) {
      return reply.status(401).send({
        error: { code: "Unauthorized", message: "Invalid email or password" },
      });
    }

    const token = await reply.jwtSign({
      sub: user.id,
      email: user.email,
    });

    return { token, userId: user.id };
  });
};
