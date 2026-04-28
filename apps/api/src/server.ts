import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import rawBody from "fastify-raw-body";
import Fastify, { type FastifyInstance } from "fastify";

import { getEnv } from "./env.js";
import { getPrisma } from "./db.js";
import { authenticate } from "./middleware/authenticate.js";
import { authRoutes } from "./routes/auth.js";
import { householdChildrenRoutes } from "./routes/children.js";
import { householdProvidersRoutes } from "./routes/providers.js";
import { householdLessonsRoutes } from "./routes/lessons.js";
import { calendarRoutes } from "./routes/calendar.js";
import { invitationRoutes } from "./routes/invitations.js";
import { reminderRoutes } from "./routes/reminders.js";
import { stripeRoutes } from "./routes/stripe.js";

export async function buildApp(): Promise<FastifyInstance> {
  const env = getEnv();

  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: true,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });

  await app.register(jwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: "7d" },
  });

  await app.register(rawBody, { field: "rawBody", global: false, runFirst: true });

  app.get("/health", async () => ({
    ok: true,
    service: "family-private-class-tracker-api",
  }));

  await app.register(authRoutes, { prefix: "/auth" });

  await app.register(householdChildrenRoutes, {
    prefix: "/households/:householdId/children",
  });
  await app.register(householdProvidersRoutes, {
    prefix: "/households/:householdId/providers",
  });
  await app.register(householdLessonsRoutes, {
    prefix: "/households/:householdId/lessons",
  });
  await app.register(calendarRoutes, {
    prefix: "/calendar",
  });
  await app.register(invitationRoutes, {
    prefix: "/invitations",
  });
  await app.register(reminderRoutes, {
    prefix: "/reminders",
  });
  await app.register(stripeRoutes, {
    prefix: "/stripe",
  });

  app.get(
    "/me",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const jwtUser = request.user as { sub: string; email: string };
      const prisma = getPrisma();
      const memberships = await prisma.householdMember.findMany({
        where: { userId: jwtUser.sub },
        select: { householdId: true, role: true, household: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
      });
      if (memberships.length === 0) {
        return reply.status(404).send({
          error: {
            code: "NotFound",
            message: "No household membership for this user",
          },
        });
      }
      const primary =
        memberships.find((m) => m.role === "OWNER") ?? memberships[0];
      return {
        user: { id: jwtUser.sub, email: jwtUser.email },
        householdId: primary.householdId,
        role: primary.role,
        memberships: memberships.map((m) => ({
          householdId: m.householdId,
          householdName: m.household.name,
          role: m.role,
        })),
      };
    }
  );

  return app;
}
