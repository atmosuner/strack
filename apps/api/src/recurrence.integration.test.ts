import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { disconnectPrisma, resetPrismaForTests } from "./db.js";
import { resetEnvCache } from "./env.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const apiRoot = join(__dirname, "..");

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);

type AppType = Awaited<ReturnType<typeof import("./server.js").buildApp>>;

async function register(
  app: AppType,
  suffix: string
): Promise<{ token: string; householdId: string }> {
  const email = `rec-${suffix}-${Date.now()}@example.com`;
  const res = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email, password: "password12", householdName: `Home ${suffix}` },
  });
  expect(res.statusCode).toBe(200);
  return res.json() as { token: string; householdId: string };
}

async function seedChildAndProvider(
  app: AppType,
  token: string,
  householdId: string
): Promise<{ childId: string; providerId: string }> {
  const [c, p] = await Promise.all([
    app.inject({
      method: "POST",
      url: `/households/${householdId}/children`,
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "Alex" },
    }),
    app.inject({
      method: "POST",
      url: `/households/${householdId}/providers`,
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "Coach Kim" },
    }),
  ]);
  return {
    childId: (c.json() as { child: { id: string } }).child.id,
    providerId: (p.json() as { provider: { id: string } }).provider.id,
  };
}

describe.skipIf(!hasDatabaseUrl)(
  "recurring lessons (integration)",
  () => {
    let app: AppType;

    beforeAll(async () => {
      process.env.NODE_ENV = "test";
      process.env.JWT_SECRET =
        process.env.JWT_SECRET ?? "integration-jwt-secret-16min";

      execSync("pnpm exec prisma migrate deploy", {
        cwd: apiRoot,
        env: process.env,
        stdio: "inherit",
      });

      resetEnvCache();
      const { buildApp } = await import("./server.js");
      app = await buildApp();
    }, 120_000);

    afterAll(async () => {
      await app.close();
      await disconnectPrisma();
      resetPrismaForTests();
      resetEnvCache();
    }, 30_000);

    it("creates a recurring lesson and expands in list", async () => {
      const { token, householdId } = await register(app, "rec1");
      const { childId, providerId } = await seedChildAndProvider(app, token, householdId);

      const create = await app.inject({
        method: "POST",
        url: `/households/${householdId}/lessons`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          childId,
          providerId,
          title: "Weekly Piano",
          startAt: "2026-05-04T10:00:00Z",
          endAt: "2026-05-04T11:00:00Z",
          recurrenceRule: { freq: "weekly", interval: 1, count: 4 },
        },
      });
      expect(create.statusCode).toBe(201);
      const lesson = (create.json() as { lesson: { id: string; recurrenceRule: string } }).lesson;
      expect(lesson.recurrenceRule).toBeTruthy();

      const list = await app.inject({
        method: "GET",
        url: `/households/${householdId}/lessons?from=2026-05-01T00:00:00Z&to=2026-06-30T00:00:00Z`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(list.statusCode).toBe(200);
      const lessons = (list.json() as { lessons: { occurrenceDate: string }[] }).lessons;
      expect(lessons).toHaveLength(4);
      expect(lessons[0].occurrenceDate).toBe("2026-05-04");
      expect(lessons[1].occurrenceDate).toBe("2026-05-11");
      expect(lessons[2].occurrenceDate).toBe("2026-05-18");
      expect(lessons[3].occurrenceDate).toBe("2026-05-25");
    });

    it("skips a single occurrence", async () => {
      const { token, householdId } = await register(app, "skip1");
      const { childId, providerId } = await seedChildAndProvider(app, token, householdId);

      const create = await app.inject({
        method: "POST",
        url: `/households/${householdId}/lessons`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          childId,
          providerId,
          title: "Weekly Swim",
          startAt: "2026-05-04T09:00:00Z",
          endAt: "2026-05-04T10:00:00Z",
          recurrenceRule: { freq: "weekly", interval: 1, count: 4 },
        },
      });
      const lessonId = (create.json() as { lesson: { id: string } }).lesson.id;

      const skip = await app.inject({
        method: "POST",
        url: `/households/${householdId}/lessons/${lessonId}/exceptions`,
        headers: { authorization: `Bearer ${token}` },
        payload: { date: "2026-05-11", action: "skip" },
      });
      expect(skip.statusCode).toBe(201);

      const list = await app.inject({
        method: "GET",
        url: `/households/${householdId}/lessons?from=2026-05-01T00:00:00Z&to=2026-06-30T00:00:00Z`,
        headers: { authorization: `Bearer ${token}` },
      });
      const dates = (list.json() as { lessons: { occurrenceDate: string }[] }).lessons.map(
        (l) => l.occurrenceDate
      );
      expect(dates).not.toContain("2026-05-11");
      expect(dates).toHaveLength(3);
    });

    it("edits a single occurrence without changing the series", async () => {
      const { token, householdId } = await register(app, "edit1");
      const { childId, providerId } = await seedChildAndProvider(app, token, householdId);

      const create = await app.inject({
        method: "POST",
        url: `/households/${householdId}/lessons`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          childId,
          providerId,
          title: "Weekly Art",
          startAt: "2026-05-04T14:00:00Z",
          endAt: "2026-05-04T15:00:00Z",
          recurrenceRule: { freq: "weekly", interval: 1, count: 3 },
        },
      });
      const lessonId = (create.json() as { lesson: { id: string } }).lesson.id;

      const edit = await app.inject({
        method: "POST",
        url: `/households/${householdId}/lessons/${lessonId}/exceptions`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          date: "2026-05-11",
          action: "edit",
          title: "Special Art Class",
          startAt: "2026-05-11T16:00:00Z",
          endAt: "2026-05-11T17:00:00Z",
        },
      });
      expect(edit.statusCode).toBe(201);

      const list = await app.inject({
        method: "GET",
        url: `/households/${householdId}/lessons?from=2026-05-01T00:00:00Z&to=2026-06-30T00:00:00Z`,
        headers: { authorization: `Bearer ${token}` },
      });
      const lessons = (list.json() as { lessons: { title: string; occurrenceDate: string; startAt: string }[] }).lessons;
      expect(lessons).toHaveLength(3);

      const may11 = lessons.find((l) => l.occurrenceDate === "2026-05-11");
      expect(may11).toBeDefined();
      expect(may11!.title).toBe("Special Art Class");
      expect(may11!.startAt).toContain("T16:00:00");

      const may4 = lessons.find((l) => l.occurrenceDate === "2026-05-04");
      expect(may4!.title).toBe("Weekly Art");
    });

    it("rejects duplicate exception for the same date", async () => {
      const { token, householdId } = await register(app, "dup1");
      const { childId, providerId } = await seedChildAndProvider(app, token, householdId);

      const create = await app.inject({
        method: "POST",
        url: `/households/${householdId}/lessons`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          childId,
          providerId,
          title: "Weekly Dance",
          startAt: "2026-05-04T10:00:00Z",
          endAt: "2026-05-04T11:00:00Z",
          recurrenceRule: { freq: "weekly", interval: 1 },
        },
      });
      const lessonId = (create.json() as { lesson: { id: string } }).lesson.id;

      await app.inject({
        method: "POST",
        url: `/households/${householdId}/lessons/${lessonId}/exceptions`,
        headers: { authorization: `Bearer ${token}` },
        payload: { date: "2026-05-11", action: "skip" },
      });

      const dup = await app.inject({
        method: "POST",
        url: `/households/${householdId}/lessons/${lessonId}/exceptions`,
        headers: { authorization: `Bearer ${token}` },
        payload: { date: "2026-05-11", action: "skip" },
      });
      expect(dup.statusCode).toBe(409);
    });

    it("deleting a recurring parent cascades exceptions", async () => {
      const { token, householdId } = await register(app, "cascade1");
      const { childId, providerId } = await seedChildAndProvider(app, token, householdId);

      const create = await app.inject({
        method: "POST",
        url: `/households/${householdId}/lessons`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          childId,
          providerId,
          title: "Weekly Music",
          startAt: "2026-05-04T10:00:00Z",
          endAt: "2026-05-04T11:00:00Z",
          recurrenceRule: { freq: "weekly", interval: 1, count: 4 },
        },
      });
      const lessonId = (create.json() as { lesson: { id: string } }).lesson.id;

      await app.inject({
        method: "POST",
        url: `/households/${householdId}/lessons/${lessonId}/exceptions`,
        headers: { authorization: `Bearer ${token}` },
        payload: { date: "2026-05-11", action: "skip" },
      });

      const del = await app.inject({
        method: "DELETE",
        url: `/households/${householdId}/lessons/${lessonId}`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(del.statusCode).toBe(204);

      const list = await app.inject({
        method: "GET",
        url: `/households/${householdId}/lessons?from=2026-05-01T00:00:00Z&to=2026-06-30T00:00:00Z`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect((list.json() as { lessons: unknown[] }).lessons).toHaveLength(0);
    });
  }
);
