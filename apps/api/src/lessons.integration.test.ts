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
  const email = `lesson-${suffix}-${Date.now()}@example.com`;
  const res = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email, password: "password12", householdName: `Home ${suffix}` },
  });
  expect(res.statusCode).toBe(200);
  const body = res.json() as { token: string; householdId: string };
  return body;
}

async function seedChildAndProvider(
  app: AppType,
  token: string,
  householdId: string
): Promise<{ childId: string; providerId: string }> {
  const childRes = await app.inject({
    method: "POST",
    url: `/households/${householdId}/children`,
    headers: { authorization: `Bearer ${token}` },
    payload: { name: "Alex" },
  });
  const providerRes = await app.inject({
    method: "POST",
    url: `/households/${householdId}/providers`,
    headers: { authorization: `Bearer ${token}` },
    payload: { name: "Coach Kim" },
  });
  const childId = (childRes.json() as { child: { id: string } }).child.id;
  const providerId = (providerRes.json() as { provider: { id: string } }).provider.id;
  return { childId, providerId };
}

describe.skipIf(!hasDatabaseUrl)(
  "household lessons CRUD (integration)",
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

    it("creates, reads, lists, patches, and deletes a lesson", async () => {
      const { token, householdId } = await register(app, "crud");
      const { childId, providerId } = await seedChildAndProvider(app, token, householdId);

      const start = new Date("2026-05-01T10:00:00Z").toISOString();
      const end = new Date("2026-05-01T11:00:00Z").toISOString();

      // CREATE
      const create = await app.inject({
        method: "POST",
        url: `/households/${householdId}/lessons`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          childId,
          providerId,
          title: "Piano Lesson",
          startAt: start,
          endAt: end,
          location: "Studio A",
          notes: "Bring book 3",
        },
      });
      expect(create.statusCode).toBe(201);
      const lesson = (create.json() as { lesson: { id: string; title: string; child: { name: string }; provider: { name: string } } }).lesson;
      expect(lesson.title).toBe("Piano Lesson");
      expect(lesson.child.name).toBe("Alex");
      expect(lesson.provider.name).toBe("Coach Kim");

      // GET by id
      const get = await app.inject({
        method: "GET",
        url: `/households/${householdId}/lessons/${lesson.id}`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(get.statusCode).toBe(200);
      expect((get.json() as { lesson: { id: string } }).lesson.id).toBe(lesson.id);

      // LIST
      const list = await app.inject({
        method: "GET",
        url: `/households/${householdId}/lessons`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(list.statusCode).toBe(200);
      const lessons = (list.json() as { lessons: { id: string }[] }).lessons;
      expect(lessons.length).toBeGreaterThanOrEqual(1);
      expect(lessons.some((l) => l.id === lesson.id)).toBe(true);

      // PATCH
      const patch = await app.inject({
        method: "PATCH",
        url: `/households/${householdId}/lessons/${lesson.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { title: "Advanced Piano", location: null },
      });
      expect(patch.statusCode).toBe(200);
      const patched = (patch.json() as { lesson: { title: string; location: string | null } }).lesson;
      expect(patched.title).toBe("Advanced Piano");
      expect(patched.location).toBeNull();

      // DELETE
      const del = await app.inject({
        method: "DELETE",
        url: `/households/${householdId}/lessons/${lesson.id}`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(del.statusCode).toBe(204);

      // GET after delete → 404
      const gone = await app.inject({
        method: "GET",
        url: `/households/${householdId}/lessons/${lesson.id}`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(gone.statusCode).toBe(404);
    });

    it("rejects creating a lesson with endAt before startAt", async () => {
      const { token, householdId } = await register(app, "timecheck");
      const { childId, providerId } = await seedChildAndProvider(app, token, householdId);

      const res = await app.inject({
        method: "POST",
        url: `/households/${householdId}/lessons`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          childId,
          providerId,
          title: "Bad time",
          startAt: "2026-05-01T12:00:00Z",
          endAt: "2026-05-01T11:00:00Z",
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it("rejects lesson with archived child", async () => {
      const { token, householdId } = await register(app, "archived");
      const { childId, providerId } = await seedChildAndProvider(app, token, householdId);

      await app.inject({
        method: "PATCH",
        url: `/households/${householdId}/children/${childId}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { archived: true },
      });

      const res = await app.inject({
        method: "POST",
        url: `/households/${householdId}/lessons`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          childId,
          providerId,
          title: "Fail",
          startAt: "2026-05-01T10:00:00Z",
          endAt: "2026-05-01T11:00:00Z",
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it("returns 403 when user is not a member of the household", async () => {
      const a = await register(app, "owner403");
      const b = await register(app, "other403");
      const { childId, providerId } = await seedChildAndProvider(app, a.token, a.householdId);

      // list
      const list = await app.inject({
        method: "GET",
        url: `/households/${a.householdId}/lessons`,
        headers: { authorization: `Bearer ${b.token}` },
      });
      expect(list.statusCode).toBe(403);

      // create
      const create = await app.inject({
        method: "POST",
        url: `/households/${a.householdId}/lessons`,
        headers: { authorization: `Bearer ${b.token}` },
        payload: {
          childId,
          providerId,
          title: "Piano",
          startAt: "2026-05-01T10:00:00Z",
          endAt: "2026-05-01T11:00:00Z",
        },
      });
      expect(create.statusCode).toBe(403);
    });

    it("returns 404 for a non-existent lesson id", async () => {
      const { token, householdId } = await register(app, "notfound");
      const fake = "00000000-0000-4000-8000-000000000000";

      const res = await app.inject({
        method: "GET",
        url: `/households/${householdId}/lessons/${fake}`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(404);
    });

    it("filters lessons by date range", async () => {
      const { token, householdId } = await register(app, "filter");
      const { childId, providerId } = await seedChildAndProvider(app, token, householdId);

      await app.inject({
        method: "POST",
        url: `/households/${householdId}/lessons`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          childId,
          providerId,
          title: "May lesson",
          startAt: "2026-05-10T10:00:00Z",
          endAt: "2026-05-10T11:00:00Z",
        },
      });
      await app.inject({
        method: "POST",
        url: `/households/${householdId}/lessons`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          childId,
          providerId,
          title: "June lesson",
          startAt: "2026-06-10T10:00:00Z",
          endAt: "2026-06-10T11:00:00Z",
        },
      });

      const mayOnly = await app.inject({
        method: "GET",
        url: `/households/${householdId}/lessons?from=2026-05-01T00:00:00Z&to=2026-05-31T23:59:59Z`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(mayOnly.statusCode).toBe(200);
      const titles = (mayOnly.json() as { lessons: { title: string }[] }).lessons.map((l) => l.title);
      expect(titles).toContain("May lesson");
      expect(titles).not.toContain("June lesson");
    });
  }
);
