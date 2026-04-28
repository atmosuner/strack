import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { getPrisma } from "../db.js";
import { authenticate } from "../middleware/authenticate.js";
import {
  expandOccurrencesInRange,
  parseRecurrenceRule,
} from "@fpct/shared";

const ALLOWED_OFFSETS = [5, 10, 15, 30, 60, 120];

const pushTokenBody = z.object({
  token: z.string().min(1).max(500),
  platform: z.enum(["expo", "web"]).default("expo"),
});

const prefBody = z.object({
  enabled: z.boolean().optional(),
  minutesBefore: z.number().int().refine((v) => ALLOWED_OFFSETS.includes(v), {
    message: `Must be one of: ${ALLOWED_OFFSETS.join(", ")}`,
  }).optional(),
});

export const reminderRoutes: FastifyPluginAsync = async (app) => {
  // Register / upsert push token
  app.post("/push-tokens", { preHandler: [authenticate] }, async (request, reply) => {
    const parse = pushTokenBody.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ error: { code: "BadRequest", message: parse.error.message } });
    }
    const jwtUser = request.user as { sub: string };
    const prisma = getPrisma();

    await prisma.pushToken.upsert({
      where: { token: parse.data.token },
      create: { userId: jwtUser.sub, token: parse.data.token, platform: parse.data.platform },
      update: { userId: jwtUser.sub, platform: parse.data.platform },
    });

    return reply.status(201).send({ ok: true });
  });

  // Delete push token (logout / unregister)
  app.delete("/push-tokens", { preHandler: [authenticate] }, async (request, reply) => {
    const { token } = request.query as { token?: string };
    if (!token) {
      return reply.status(400).send({ error: { code: "BadRequest", message: "token query param required" } });
    }
    const jwtUser = request.user as { sub: string };
    const prisma = getPrisma();

    await prisma.pushToken.deleteMany({ where: { token, userId: jwtUser.sub } });
    return reply.status(204).send();
  });

  // Get reminder preferences
  app.get("/preferences", { preHandler: [authenticate] }, async (request) => {
    const jwtUser = request.user as { sub: string };
    const prisma = getPrisma();

    const pref = await prisma.reminderPref.findUnique({ where: { userId: jwtUser.sub } });
    return {
      preferences: pref ?? { enabled: true, minutesBefore: 30 },
      allowedOffsets: ALLOWED_OFFSETS,
    };
  });

  // Update reminder preferences
  app.patch("/preferences", { preHandler: [authenticate] }, async (request, reply) => {
    const parse = prefBody.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ error: { code: "BadRequest", message: parse.error.message } });
    }
    const jwtUser = request.user as { sub: string };
    const prisma = getPrisma();

    const pref = await prisma.reminderPref.upsert({
      where: { userId: jwtUser.sub },
      create: {
        userId: jwtUser.sub,
        enabled: parse.data.enabled ?? true,
        minutesBefore: parse.data.minutesBefore ?? 30,
      },
      update: {
        ...(parse.data.enabled !== undefined && { enabled: parse.data.enabled }),
        ...(parse.data.minutesBefore !== undefined && { minutesBefore: parse.data.minutesBefore }),
      },
    });

    return { preferences: pref };
  });

  // Cron-callable endpoint: check & send due reminders
  // In production, call this via external cron (e.g. Vercel cron, Railway cron, or pg_cron)
  // Protected by a shared secret in the CRON_SECRET env var
  app.post("/check", async (request, reply) => {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = (request.headers as Record<string, string>).authorization;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return reply.status(401).send({ error: { code: "Unauthorized", message: "Invalid cron secret" } });
    }

    const prisma = getPrisma();
    const now = new Date();

    const prefs = await prisma.reminderPref.findMany({
      where: { enabled: true },
      include: { user: { include: { pushTokens: true, memberships: true } } },
    });

    let sent = 0;
    let skipped = 0;

    for (const pref of prefs) {
      if (pref.user.pushTokens.length === 0) continue;

      const windowStart = now;
      const windowEnd = new Date(now.getTime() + pref.minutesBefore * 60_000);

      for (const membership of pref.user.memberships) {
        const lessons = await prisma.lesson.findMany({
          where: {
            householdId: membership.householdId,
            seriesId: null,
          },
          include: { exceptions: true },
        });

        for (const lesson of lessons) {
          const rule = lesson.recurrenceRule
            ? parseRecurrenceRule(lesson.recurrenceRule)
            : null;

          type OccToCheck = { lessonId: string; date: string; startAt: string; title: string };
          const toCheck: OccToCheck[] = [];

          if (!rule) {
            const s = lesson.startAt;
            if (s >= windowStart && s <= windowEnd) {
              toCheck.push({
                lessonId: lesson.id,
                date: s.toISOString().slice(0, 10),
                startAt: s.toISOString(),
                title: lesson.title,
              });
            }
          } else {
            const excDates = new Set(
              lesson.exceptions
                .filter((e) => e.cancelled && e.exceptionDate)
                .map((e) => e.exceptionDate!.toISOString().slice(0, 10))
            );
            const occs = expandOccurrencesInRange(
              lesson.startAt.toISOString(),
              lesson.endAt.toISOString(),
              rule,
              windowStart.toISOString(),
              windowEnd.toISOString(),
              excDates
            );
            for (const occ of occs) {
              toCheck.push({
                lessonId: lesson.id,
                date: occ.date,
                startAt: occ.startAt,
                title: lesson.title,
              });
            }
          }

          for (const occ of toCheck) {
            const existing = await prisma.sentReminder.findUnique({
              where: {
                userId_lessonId_occurrenceDate: {
                  userId: pref.userId,
                  lessonId: occ.lessonId,
                  occurrenceDate: occ.date,
                },
              },
            });
            if (existing) {
              skipped++;
              continue;
            }

            // Send push via Expo Push API
            for (const pt of pref.user.pushTokens) {
              try {
                await fetch("https://exp.host/--/api/v2/push/send", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    to: pt.token,
                    title: "Lesson Reminder",
                    body: `${occ.title} starts in ${pref.minutesBefore} minutes`,
                    data: { lessonId: occ.lessonId, date: occ.date },
                  }),
                });
              } catch {
                // Best-effort; log in production
              }
            }

            await prisma.sentReminder.create({
              data: {
                userId: pref.userId,
                lessonId: occ.lessonId,
                occurrenceDate: occ.date,
              },
            });
            sent++;
          }
        }
      }
    }

    return { sent, skipped, checkedAt: now.toISOString() };
  });
};
