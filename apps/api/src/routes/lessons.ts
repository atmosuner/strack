import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  expandOccurrencesInRange,
  parseRecurrenceRule,
  type RecurrenceRule,
} from "@fpct/shared";

import { getPrisma } from "../db.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireHouseholdMember } from "../middleware/requireHouseholdMember.js";

const pre = [authenticate, requireHouseholdMember];

const isoDatetime = z.string().datetime({ offset: true });

const recurrenceRuleSchema = z.object({
  freq: z.literal("weekly"),
  interval: z.number().int().min(1).max(4).default(1),
  until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  count: z.number().int().min(1).max(200).optional(),
});

const createBody = z
  .object({
    childId: z.string().uuid(),
    providerId: z.string().uuid(),
    title: z.string().min(1).max(300),
    startAt: isoDatetime,
    endAt: isoDatetime,
    location: z.string().max(500).optional().nullable(),
    notes: z.string().max(2000).optional().nullable(),
    recurrenceRule: recurrenceRuleSchema.optional().nullable(),
  })
  .refine((d) => new Date(d.endAt) > new Date(d.startAt), {
    message: "endAt must be after startAt",
    path: ["endAt"],
  });

const paymentStatusEnum = z.enum(["UNPAID", "PAID"]);

const patchBody = z
  .object({
    childId: z.string().uuid().optional(),
    providerId: z.string().uuid().optional(),
    title: z.string().min(1).max(300).optional(),
    startAt: isoDatetime.optional(),
    endAt: isoDatetime.optional(),
    location: z.union([z.string().max(500), z.null()]).optional(),
    notes: z.union([z.string().max(2000), z.null()]).optional(),
    paymentStatus: paymentStatusEnum.optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: "At least one field is required",
  });

const listQuery = z
  .object({
    from: isoDatetime.optional(),
    to: isoDatetime.optional(),
    childId: z.string().uuid().optional(),
    providerId: z.string().uuid().optional(),
  })
  .optional()
  .default({});

const exceptionBody = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    action: z.enum(["edit", "skip"]),
    title: z.string().min(1).max(300).optional(),
    childId: z.string().uuid().optional(),
    providerId: z.string().uuid().optional(),
    startAt: isoDatetime.optional(),
    endAt: isoDatetime.optional(),
    location: z.union([z.string().max(500), z.null()]).optional(),
    notes: z.union([z.string().max(2000), z.null()]).optional(),
  })
  .refine(
    (d) => d.action === "skip" || Object.keys(d).length > 2,
    { message: "Edit exceptions need at least one changed field" }
  );

const includeRels = {
  child: { select: { id: true, name: true } },
  provider: { select: { id: true, name: true } },
} as const;

type ExpandedLesson = {
  id: string;
  seriesId: string | null;
  title: string;
  startAt: string;
  endAt: string;
  location: string | null;
  notes: string | null;
  cancelled: boolean;
  recurrenceRule: RecurrenceRule | null;
  isOccurrence: boolean;
  occurrenceDate: string | null;
  paymentStatus: string;
  child: { id: string; name: string };
  provider: { id: string; name: string };
};

function getRole(request: unknown): string {
  return (request as Record<string, unknown>).householdRole as string ?? "MEMBER";
}

function stripPaymentForMember<T extends { paymentStatus?: unknown }>(
  obj: T,
  role: string
): T {
  if (role !== "OWNER") {
    const { paymentStatus: _, ...rest } = obj;
    return rest as T;
  }
  return obj;
}

export const householdLessonsRoutes: FastifyPluginAsync = async (app) => {
  // LIST — expands recurring lessons into individual occurrences
  app.get("/", { preHandler: pre }, async (request) => {
    const { householdId } = request.params as { householdId: string };
    const query = listQuery.parse(request.query);

    const defaultFrom = new Date();
    defaultFrom.setDate(defaultFrom.getDate() - 30);
    const defaultTo = new Date();
    defaultTo.setDate(defaultTo.getDate() + 90);

    const rangeStart = query.from ?? defaultFrom.toISOString();
    const rangeEnd = query.to ?? defaultTo.toISOString();

    const prisma = getPrisma();

    const baseWhere: Record<string, unknown> = {
      householdId,
      seriesId: null,
    };
    if (query.childId) baseWhere.childId = query.childId;
    if (query.providerId) baseWhere.providerId = query.providerId;

    const parents = await prisma.lesson.findMany({
      where: baseWhere,
      include: { ...includeRels, exceptions: true },
      orderBy: { startAt: "asc" },
    });

    const results: ExpandedLesson[] = [];

    for (const p of parents) {
      const rule = p.recurrenceRule
        ? parseRecurrenceRule(p.recurrenceRule)
        : null;

      if (!rule) {
        const s = new Date(p.startAt).getTime();
        const rS = new Date(rangeStart).getTime();
        const rE = new Date(rangeEnd).getTime();
        if (s >= rS && s <= rE) {
          results.push({
            id: p.id,
            seriesId: null,
            title: p.title,
            startAt: p.startAt.toISOString(),
            endAt: p.endAt.toISOString(),
            location: p.location,
            notes: p.notes,
            cancelled: p.cancelled,
            recurrenceRule: null,
            isOccurrence: false,
            occurrenceDate: null,
            paymentStatus: p.paymentStatus,
            child: p.child,
            provider: p.provider,
          });
        }
        continue;
      }

      // Build exception map: date → exception row
      const excMap = new Map<
        string,
        (typeof p.exceptions)[number]
      >();
      for (const ex of p.exceptions) {
        if (ex.exceptionDate) {
          excMap.set(ex.exceptionDate.toISOString().slice(0, 10), ex);
        }
      }

      const occurrences = expandOccurrencesInRange(
        p.startAt.toISOString(),
        p.endAt.toISOString(),
        rule,
        rangeStart,
        rangeEnd,
        new Set<string>()
      );

      for (const occ of occurrences) {
        const exc = excMap.get(occ.date);
        if (exc) {
          if (exc.cancelled) continue;
          results.push({
            id: exc.id,
            seriesId: p.id,
            title: exc.title,
            startAt: exc.startAt.toISOString(),
            endAt: exc.endAt.toISOString(),
            location: exc.location,
            notes: exc.notes,
            cancelled: false,
            recurrenceRule: rule,
            isOccurrence: true,
            occurrenceDate: occ.date,
            paymentStatus: exc.paymentStatus,
            child: p.child,
            provider: p.provider,
          });
        } else {
          results.push({
            id: p.id,
            seriesId: null,
            title: p.title,
            startAt: occ.startAt,
            endAt: occ.endAt,
            location: p.location,
            notes: p.notes,
            cancelled: false,
            recurrenceRule: rule,
            isOccurrence: true,
            occurrenceDate: occ.date,
            paymentStatus: p.paymentStatus,
            child: p.child,
            provider: p.provider,
          });
        }
      }
    }

    results.sort(
      (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
    );

    const role = getRole(request);
    return { lessons: results.map((l) => stripPaymentForMember(l, role)) };
  });

  // CREATE
  app.post("/", { preHandler: pre }, async (request, reply) => {
    const { householdId } = request.params as { householdId: string };
    const parse = createBody.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({
        error: { code: "BadRequest", message: parse.error.message },
      });
    }

    const prisma = getPrisma();
    const { childId, providerId } = parse.data;

    const [child, provider] = await Promise.all([
      prisma.child.findFirst({ where: { id: childId, householdId, archived: false } }),
      prisma.provider.findFirst({ where: { id: providerId, householdId, archived: false } }),
    ]);
    if (!child) {
      return reply.status(400).send({
        error: { code: "BadRequest", message: "Child not found or archived" },
      });
    }
    if (!provider) {
      return reply.status(400).send({
        error: { code: "BadRequest", message: "Provider not found or archived" },
      });
    }

    const lesson = await prisma.lesson.create({
      data: {
        householdId,
        childId,
        providerId,
        title: parse.data.title.trim(),
        startAt: new Date(parse.data.startAt),
        endAt: new Date(parse.data.endAt),
        location: parse.data.location ?? null,
        notes: parse.data.notes ?? null,
        recurrenceRule: parse.data.recurrenceRule
          ? JSON.stringify(parse.data.recurrenceRule)
          : null,
      },
      include: includeRels,
    });
    return reply.status(201).send({ lesson });
  });

  // CREATE EXCEPTION (edit one / skip one occurrence)
  app.post("/:lessonId/exceptions", { preHandler: pre }, async (request, reply) => {
    const { householdId, lessonId } = request.params as {
      householdId: string;
      lessonId: string;
    };

    const parse = exceptionBody.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({
        error: { code: "BadRequest", message: parse.error.message },
      });
    }

    const prisma = getPrisma();
    const parent = await prisma.lesson.findFirst({
      where: { id: lessonId, householdId, recurrenceRule: { not: null }, seriesId: null },
    });
    if (!parent) {
      return reply.status(404).send({
        error: { code: "NotFound", message: "Recurring lesson not found" },
      });
    }

    const existing = await prisma.lesson.findFirst({
      where: { seriesId: lessonId, exceptionDate: new Date(parse.data.date + "T00:00:00.000Z") },
    });
    if (existing) {
      return reply.status(409).send({
        error: { code: "Conflict", message: "Exception already exists for this date" },
      });
    }

    const body = parse.data;

    if (body.action === "skip") {
      const exception = await prisma.lesson.create({
        data: {
          householdId,
          childId: parent.childId,
          providerId: parent.providerId,
          title: parent.title,
          startAt: parent.startAt,
          endAt: parent.endAt,
          seriesId: lessonId,
          exceptionDate: new Date(body.date + "T00:00:00.000Z"),
          cancelled: true,
        },
        include: includeRels,
      });
      return reply.status(201).send({ exception });
    }

    // action === "edit"
    const exception = await prisma.lesson.create({
      data: {
        householdId,
        childId: body.childId ?? parent.childId,
        providerId: body.providerId ?? parent.providerId,
        title: body.title?.trim() ?? parent.title,
        startAt: body.startAt ? new Date(body.startAt) : parent.startAt,
        endAt: body.endAt ? new Date(body.endAt) : parent.endAt,
        location: body.location !== undefined ? body.location : parent.location,
        notes: body.notes !== undefined ? body.notes : parent.notes,
        seriesId: lessonId,
        exceptionDate: new Date(body.date + "T00:00:00.000Z"),
        cancelled: false,
      },
      include: includeRels,
    });
    return reply.status(201).send({ exception });
  });

  // GET by id
  app.get("/:lessonId", { preHandler: pre }, async (request, reply) => {
    const { householdId, lessonId } = request.params as {
      householdId: string;
      lessonId: string;
    };

    const prisma = getPrisma();
    const lesson = await prisma.lesson.findFirst({
      where: { id: lessonId, householdId },
      include: includeRels,
    });
    if (!lesson) {
      return reply.status(404).send({
        error: { code: "NotFound", message: "Lesson not found" },
      });
    }
    const role = getRole(request);
    return { lesson: stripPaymentForMember(lesson, role) };
  });

  // PATCH (works for both parent lessons and exception rows)
  app.patch("/:lessonId", { preHandler: pre }, async (request, reply) => {
    const { householdId, lessonId } = request.params as {
      householdId: string;
      lessonId: string;
    };

    const parse = patchBody.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({
        error: { code: "BadRequest", message: parse.error.message },
      });
    }

    const prisma = getPrisma();
    const existing = await prisma.lesson.findFirst({
      where: { id: lessonId, householdId },
    });
    if (!existing) {
      return reply.status(404).send({
        error: { code: "NotFound", message: "Lesson not found" },
      });
    }

    const body = parse.data;
    const data: Record<string, unknown> = {};

    if (body.childId !== undefined) {
      const child = await prisma.child.findFirst({ where: { id: body.childId, householdId, archived: false } });
      if (!child) {
        return reply.status(400).send({ error: { code: "BadRequest", message: "Child not found or archived" } });
      }
      data.childId = body.childId;
    }
    if (body.providerId !== undefined) {
      const provider = await prisma.provider.findFirst({ where: { id: body.providerId, householdId, archived: false } });
      if (!provider) {
        return reply.status(400).send({ error: { code: "BadRequest", message: "Provider not found or archived" } });
      }
      data.providerId = body.providerId;
    }
    if (body.title !== undefined) data.title = body.title.trim();
    if (body.startAt !== undefined) data.startAt = new Date(body.startAt);
    if (body.endAt !== undefined) data.endAt = new Date(body.endAt);
    if (body.location !== undefined) data.location = body.location;
    if (body.notes !== undefined) data.notes = body.notes;

    if (body.paymentStatus !== undefined) {
      const role = getRole(request);
      if (role !== "OWNER") {
        return reply.status(403).send({
          error: { code: "Forbidden", message: "Only the owner can update payment status" },
        });
      }
      data.paymentStatus = body.paymentStatus;
    }

    const finalStart = (data.startAt as Date | undefined) ?? existing.startAt;
    const finalEnd = (data.endAt as Date | undefined) ?? existing.endAt;
    if (finalEnd <= finalStart) {
      return reply.status(400).send({
        error: { code: "BadRequest", message: "endAt must be after startAt" },
      });
    }

    const lesson = await prisma.lesson.update({
      where: { id: lessonId },
      data,
      include: includeRels,
    });
    const role = getRole(request);
    return { lesson: stripPaymentForMember(lesson, role) };
  });

  // DELETE
  app.delete("/:lessonId", { preHandler: pre }, async (request, reply) => {
    const { householdId, lessonId } = request.params as {
      householdId: string;
      lessonId: string;
    };

    const prisma = getPrisma();
    const existing = await prisma.lesson.findFirst({
      where: { id: lessonId, householdId },
    });
    if (!existing) {
      return reply.status(404).send({
        error: { code: "NotFound", message: "Lesson not found" },
      });
    }

    await prisma.lesson.delete({ where: { id: lessonId } });
    return reply.status(204).send();
  });
};
