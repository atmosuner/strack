import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { getPrisma } from "../db.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireHouseholdMember } from "../middleware/requireHouseholdMember.js";

const pre = [authenticate, requireHouseholdMember];

const listQuery = z
  .object({
    includeArchived: z.enum(["true", "false"]).optional(),
  })
  .transform((q) => ({
    includeArchived: q.includeArchived === "true",
  }));

const createBody = z.object({
  name: z.string().min(1).max(200),
  notes: z.string().max(2000).optional().nullable(),
});

const patchBody = z
  .object({
    name: z.string().min(1).max(200).optional(),
    notes: z.union([z.string().max(2000), z.null()]).optional(),
    archived: z.boolean().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: "At least one field is required",
  });

export const householdChildrenRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", { preHandler: pre }, async (request, reply) => {
    const { householdId } = request.params as { householdId: string };
    const parsed = listQuery.safeParse(request.query);
    const includeArchived = parsed.success ? parsed.data.includeArchived : false;

    const prisma = getPrisma();
    const where: { householdId: string; archived?: boolean } = {
      householdId,
    };
    if (!includeArchived) {
      where.archived = false;
    }

    const children = await prisma.child.findMany({
      where,
      orderBy: { name: "asc" },
    });
    return { children };
  });

  app.post("/", { preHandler: pre }, async (request, reply) => {
    const { householdId } = request.params as { householdId: string };
    const parse = createBody.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({
        error: { code: "BadRequest", message: parse.error.message },
      });
    }

    const prisma = getPrisma();
    const child = await prisma.child.create({
      data: {
        householdId,
        name: parse.data.name.trim(),
        notes: parse.data.notes ?? null,
      },
    });
    return reply.status(201).send({ child });
  });

  app.get("/:childId", { preHandler: pre }, async (request, reply) => {
    const { householdId, childId } = request.params as {
      householdId: string;
      childId: string;
    };

    const prisma = getPrisma();
    const child = await prisma.child.findFirst({
      where: { id: childId, householdId },
    });
    if (!child) {
      return reply.status(404).send({
        error: { code: "NotFound", message: "Child not found" },
      });
    }
    return { child };
  });

  app.patch("/:childId", { preHandler: pre }, async (request, reply) => {
    const { householdId, childId } = request.params as {
      householdId: string;
      childId: string;
    };

    const parse = patchBody.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({
        error: { code: "BadRequest", message: parse.error.message },
      });
    }

    const prisma = getPrisma();
    const existing = await prisma.child.findFirst({
      where: { id: childId, householdId },
    });
    if (!existing) {
      return reply.status(404).send({
        error: { code: "NotFound", message: "Child not found" },
      });
    }

    const data: {
      name?: string;
      notes?: string | null;
      archived?: boolean;
    } = {};
    const body = parse.data;
    if (body.name !== undefined) data.name = body.name.trim();
    if (body.notes !== undefined) data.notes = body.notes;
    if (body.archived !== undefined) data.archived = body.archived;

    const child = await prisma.child.update({
      where: { id: childId },
      data,
    });
    return { child };
  });
};
