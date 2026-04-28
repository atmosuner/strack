import type { FastifyReply, FastifyRequest } from "fastify";

import { getPrisma } from "../db.js";

/** Requires authenticated user and `HouseholdMember` for `params.householdId`. */
export async function requireHouseholdMember(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (reply.sent) {
    return;
  }

  const { householdId } = request.params as { householdId: string };
  const token = request.user as { sub: string };

  const prisma = getPrisma();
  const membership = await prisma.householdMember.findFirst({
    where: { householdId, userId: token.sub },
    select: { id: true, role: true },
  });

  if (!membership) {
    return reply.status(403).send({
      error: {
        code: "Forbidden",
        message: "You are not a member of this household",
      },
    });
  }

  (request as unknown as Record<string, unknown>).householdRole =
    membership.role;
}
