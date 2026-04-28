import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { getPrisma } from "../db.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireHouseholdMember } from "../middleware/requireHouseholdMember.js";

const pre = [authenticate, requireHouseholdMember];

const patchBody = z.object({
  name: z.string().min(1).max(200),
});

export const householdRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", { preHandler: pre }, async (request) => {
    const { householdId } = request.params as { householdId: string };
    const prisma = getPrisma();

    const household = await prisma.household.findUnique({
      where: { id: householdId },
      select: { id: true, name: true, createdAt: true },
    });

    const members = await prisma.householdMember.findMany({
      where: { householdId },
      select: {
        id: true,
        role: true,
        createdAt: true,
        user: { select: { id: true, email: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    return { household, members };
  });

  app.patch("/", { preHandler: pre }, async (request, reply) => {
    const { householdId } = request.params as { householdId: string };
    const role = (request as any).householdRole as string;

    if (role !== "OWNER") {
      return reply.status(403).send({
        error: { code: "Forbidden", message: "Only the owner can rename the household" },
      });
    }

    const parse = patchBody.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({
        error: { code: "BadRequest", message: parse.error.message },
      });
    }

    const prisma = getPrisma();
    const household = await prisma.household.update({
      where: { id: householdId },
      data: { name: parse.data.name.trim() },
      select: { id: true, name: true },
    });

    return { household };
  });

  app.delete("/members/:memberId", { preHandler: pre }, async (request, reply) => {
    const { householdId, memberId } = request.params as {
      householdId: string;
      memberId: string;
    };
    const role = (request as any).householdRole as string;

    if (role !== "OWNER") {
      return reply.status(403).send({
        error: { code: "Forbidden", message: "Only the owner can remove members" },
      });
    }

    const prisma = getPrisma();
    const member = await prisma.householdMember.findFirst({
      where: { id: memberId, householdId },
    });

    if (!member) {
      return reply.status(404).send({
        error: { code: "NotFound", message: "Member not found" },
      });
    }

    if (member.role === "OWNER") {
      return reply.status(400).send({
        error: { code: "BadRequest", message: "Cannot remove the owner" },
      });
    }

    await prisma.householdMember.delete({ where: { id: memberId } });
    return { ok: true };
  });
};
