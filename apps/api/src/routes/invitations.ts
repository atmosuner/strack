import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { getPrisma } from "../db.js";
import { authenticate } from "../middleware/authenticate.js";

const createBody = z.object({
  householdId: z.string().uuid(),
  email: z.string().email().max(320),
});

const acceptBody = z.object({
  token: z.string().uuid(),
});

export const invitationRoutes: FastifyPluginAsync = async (app) => {
  // CREATE invitation (owner only)
  app.post("/", { preHandler: [authenticate] }, async (request, reply) => {
    const parse = createBody.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({
        error: { code: "BadRequest", message: parse.error.message },
      });
    }

    const { householdId, email } = parse.data;
    const jwtUser = request.user as { sub: string };
    const prisma = getPrisma();

    const membership = await prisma.householdMember.findFirst({
      where: { householdId, userId: jwtUser.sub, role: "OWNER" },
    });
    if (!membership) {
      return reply.status(403).send({
        error: { code: "Forbidden", message: "Only the household owner can send invitations" },
      });
    }

    const existing = await prisma.invitation.findUnique({
      where: { householdId_email: { householdId, email: email.toLowerCase() } },
    });
    if (existing && existing.status === "PENDING") {
      return reply.status(409).send({
        error: { code: "Conflict", message: "An invitation is already pending for this email" },
      });
    }
    if (existing && existing.status === "ACCEPTED") {
      return reply.status(409).send({
        error: { code: "Conflict", message: "This user is already a member" },
      });
    }

    const alreadyMember = await prisma.householdMember.findFirst({
      where: {
        householdId,
        user: { email: email.toLowerCase() },
      },
    });
    if (alreadyMember) {
      return reply.status(409).send({
        error: { code: "Conflict", message: "This user is already a member of the household" },
      });
    }

    const invitation = await prisma.invitation.upsert({
      where: { householdId_email: { householdId, email: email.toLowerCase() } },
      create: {
        householdId,
        email: email.toLowerCase(),
        invitedBy: jwtUser.sub,
      },
      update: {
        status: "PENDING",
        invitedBy: jwtUser.sub,
      },
    });

    return reply.status(201).send({ invitation });
  });

  // LIST invitations for a household (owner only)
  app.get("/", { preHandler: [authenticate] }, async (request, reply) => {
    const { householdId } = request.query as { householdId?: string };
    if (!householdId) {
      return reply.status(400).send({
        error: { code: "BadRequest", message: "householdId query param required" },
      });
    }

    const jwtUser = request.user as { sub: string };
    const prisma = getPrisma();

    const membership = await prisma.householdMember.findFirst({
      where: { householdId, userId: jwtUser.sub, role: "OWNER" },
    });
    if (!membership) {
      return reply.status(403).send({
        error: { code: "Forbidden", message: "Only the household owner can view invitations" },
      });
    }

    const invitations = await prisma.invitation.findMany({
      where: { householdId },
      orderBy: { createdAt: "desc" },
    });
    return { invitations };
  });

  // ACCEPT invitation (any authenticated user with the token)
  app.post("/accept", { preHandler: [authenticate] }, async (request, reply) => {
    const parse = acceptBody.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({
        error: { code: "BadRequest", message: parse.error.message },
      });
    }

    const jwtUser = request.user as { sub: string; email: string };
    const prisma = getPrisma();

    const invitation = await prisma.invitation.findUnique({
      where: { token: parse.data.token },
    });
    if (!invitation || invitation.status !== "PENDING") {
      return reply.status(404).send({
        error: { code: "NotFound", message: "Invitation not found or already used" },
      });
    }

    if (invitation.email !== jwtUser.email.toLowerCase()) {
      return reply.status(403).send({
        error: { code: "Forbidden", message: "This invitation was sent to a different email" },
      });
    }

    const alreadyMember = await prisma.householdMember.findFirst({
      where: { householdId: invitation.householdId, userId: jwtUser.sub },
    });
    if (alreadyMember) {
      await prisma.invitation.update({
        where: { id: invitation.id },
        data: { status: "ACCEPTED" },
      });
      return { message: "Already a member", householdId: invitation.householdId };
    }

    await prisma.$transaction([
      prisma.householdMember.create({
        data: {
          householdId: invitation.householdId,
          userId: jwtUser.sub,
          role: invitation.role,
        },
      }),
      prisma.invitation.update({
        where: { id: invitation.id },
        data: { status: "ACCEPTED" },
      }),
    ]);

    return reply.status(200).send({
      message: "Invitation accepted",
      householdId: invitation.householdId,
      role: invitation.role,
    });
  });

  // REVOKE invitation (owner only)
  app.delete("/:invitationId", { preHandler: [authenticate] }, async (request, reply) => {
    const { invitationId } = request.params as { invitationId: string };
    const jwtUser = request.user as { sub: string };
    const prisma = getPrisma();

    const invitation = await prisma.invitation.findUnique({
      where: { id: invitationId },
    });
    if (!invitation) {
      return reply.status(404).send({
        error: { code: "NotFound", message: "Invitation not found" },
      });
    }

    const membership = await prisma.householdMember.findFirst({
      where: { householdId: invitation.householdId, userId: jwtUser.sub, role: "OWNER" },
    });
    if (!membership) {
      return reply.status(403).send({
        error: { code: "Forbidden", message: "Only the household owner can revoke invitations" },
      });
    }

    await prisma.invitation.update({
      where: { id: invitationId },
      data: { status: "REVOKED" },
    });

    return reply.status(204).send();
  });
};
