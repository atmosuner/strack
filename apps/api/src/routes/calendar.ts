import type { FastifyPluginAsync } from "fastify";
import crypto from "node:crypto";
import {
  expandOccurrencesInRange,
  parseRecurrenceRule,
} from "@fpct/shared";

import { getPrisma } from "../db.js";
import { authenticate } from "../middleware/authenticate.js";

function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function icsEscape(text: string): string {
  return text.replace(/[\\;,\n]/g, (m) => {
    if (m === "\n") return "\\n";
    return `\\${m}`;
  });
}

function fmtIcsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function foldLine(line: string): string {
  const result: string[] = [];
  let remaining = line;
  while (remaining.length > 75) {
    result.push(remaining.slice(0, 75));
    remaining = " " + remaining.slice(75);
  }
  result.push(remaining);
  return result.join("\r\n");
}

export const calendarRoutes: FastifyPluginAsync = async (app) => {
  // PUBLIC — ICS feed via secret token (no JWT required)
  app.get("/:householdId.ics", async (request, reply) => {
    const { householdId } = request.params as { householdId: string };
    const { token } = request.query as { token?: string };

    if (!token) {
      return reply.status(401).send({
        error: { code: "Unauthorized", message: "Missing token" },
      });
    }

    const prisma = getPrisma();
    const household = await prisma.household.findFirst({
      where: { id: householdId, icsToken: token },
      select: { id: true, name: true },
    });

    if (!household) {
      return reply.status(404).send({
        error: { code: "NotFound", message: "Not found" },
      });
    }

    const now = new Date();
    const rangeStart = new Date(now);
    rangeStart.setMonth(rangeStart.getMonth() - 1);
    const rangeEnd = new Date(now);
    rangeEnd.setMonth(rangeEnd.getMonth() + 6);

    const parents = await prisma.lesson.findMany({
      where: { householdId, seriesId: null },
      include: {
        child: { select: { name: true } },
        provider: { select: { name: true } },
        exceptions: true,
      },
      orderBy: { startAt: "asc" },
    });

    const lines: string[] = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//FPCT//Family Private Class Tracker//EN",
      `X-WR-CALNAME:${icsEscape(household.name)}`,
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
    ];

    for (const p of parents) {
      const rule = p.recurrenceRule
        ? parseRecurrenceRule(p.recurrenceRule)
        : null;

      if (!rule) {
        lines.push(...buildVEvent(
          p.id,
          p.title,
          p.startAt,
          p.endAt,
          p.location,
          p.notes,
          p.child.name,
          p.provider.name,
          p.updatedAt,
        ));
        continue;
      }

      const excMap = new Map<string, typeof p.exceptions[number]>();
      for (const ex of p.exceptions) {
        if (ex.exceptionDate) {
          excMap.set(ex.exceptionDate.toISOString().slice(0, 10), ex);
        }
      }

      const occurrences = expandOccurrencesInRange(
        p.startAt.toISOString(),
        p.endAt.toISOString(),
        rule,
        rangeStart.toISOString(),
        rangeEnd.toISOString(),
        new Set<string>()
      );

      for (const occ of occurrences) {
        const exc = excMap.get(occ.date);
        if (exc) {
          if (exc.cancelled) continue;
          lines.push(...buildVEvent(
            exc.id,
            exc.title,
            exc.startAt,
            exc.endAt,
            exc.location,
            exc.notes,
            p.child.name,
            p.provider.name,
            exc.updatedAt,
          ));
        } else {
          lines.push(...buildVEvent(
            `${p.id}-${occ.date}`,
            p.title,
            new Date(occ.startAt),
            new Date(occ.endAt),
            p.location,
            p.notes,
            p.child.name,
            p.provider.name,
            p.updatedAt,
          ));
        }
      }
    }

    lines.push("END:VCALENDAR");

    const icsBody = lines.map(foldLine).join("\r\n") + "\r\n";

    return reply
      .header("Content-Type", "text/calendar; charset=utf-8")
      .header("Cache-Control", "no-cache, no-store, must-revalidate")
      .send(icsBody);
  });

  // AUTHENTICATED — generate or regenerate ICS token (owner only)
  app.post("/:householdId/ics-token", { preHandler: [authenticate] }, async (request, reply) => {
    const { householdId } = request.params as { householdId: string };
    const jwtUser = request.user as { sub: string };

    const prisma = getPrisma();
    const membership = await prisma.householdMember.findFirst({
      where: { householdId, userId: jwtUser.sub, role: "OWNER" },
    });
    if (!membership) {
      return reply.status(403).send({
        error: { code: "Forbidden", message: "Only the household owner can manage the ICS token" },
      });
    }

    const newToken = generateToken();
    await prisma.household.update({
      where: { id: householdId },
      data: { icsToken: newToken },
    });

    return { icsToken: newToken };
  });

  // AUTHENTICATED — get current ICS token (owner only)
  app.get("/:householdId/ics-token", { preHandler: [authenticate] }, async (request, reply) => {
    const { householdId } = request.params as { householdId: string };
    const jwtUser = request.user as { sub: string };

    const prisma = getPrisma();
    const membership = await prisma.householdMember.findFirst({
      where: { householdId, userId: jwtUser.sub, role: "OWNER" },
    });
    if (!membership) {
      return reply.status(403).send({
        error: { code: "Forbidden", message: "Only the household owner can view the ICS token" },
      });
    }

    const household = await prisma.household.findUnique({
      where: { id: householdId },
      select: { icsToken: true },
    });

    return { icsToken: household?.icsToken ?? null };
  });
};

function buildVEvent(
  uid: string,
  title: string,
  startAt: Date,
  endAt: Date,
  location: string | null,
  notes: string | null,
  childName: string,
  providerName: string,
  updatedAt: Date,
): string[] {
  const lines = [
    "BEGIN:VEVENT",
    `UID:${uid}@fpct`,
    `DTSTAMP:${fmtIcsDate(updatedAt)}`,
    `DTSTART:${fmtIcsDate(startAt)}`,
    `DTEND:${fmtIcsDate(endAt)}`,
    `SUMMARY:${icsEscape(title)}`,
    `DESCRIPTION:${icsEscape(`${childName} with ${providerName}${notes ? "\\n" + notes : ""}`)}`,
  ];
  if (location) {
    lines.push(`LOCATION:${icsEscape(location)}`);
  }
  lines.push("END:VEVENT");
  return lines;
}
