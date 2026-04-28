import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { disconnectPrisma, resetPrismaForTests } from "./db.js";
import { resetEnvCache } from "./env.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const apiRoot = join(__dirname, "..");

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);

async function register(
  app: Awaited<ReturnType<typeof import("./server.js").buildApp>>,
  suffix: string
): Promise<{ token: string; householdId: string }> {
  const email = `u-${suffix}-${Date.now()}@example.com`;
  const res = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: {
      email,
      password: "password12",
      householdName: `Home ${suffix}`,
    },
  });
  expect(res.statusCode).toBe(200);
  const body = res.json() as { token: string; householdId: string };
  return { token: body.token, householdId: body.householdId };
}

describe.skipIf(!hasDatabaseUrl)(
  "household children & providers CRUD (integration)",
  () => {
    let app: Awaited<ReturnType<typeof import("./server.js").buildApp>>;

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

    it("creates and lists children; archives hidden by default", async () => {
      const { token, householdId } = await register(app, "child");

      const create = await app.inject({
        method: "POST",
        url: `/households/${householdId}/children`,
        headers: { authorization: `Bearer ${token}` },
        payload: { name: "Alex", notes: "Piano" },
      });
      expect(create.statusCode).toBe(201);
      const child = (create.json() as { child: { id: string; name: string } })
        .child;
      expect(child.name).toBe("Alex");

      const list = await app.inject({
        method: "GET",
        url: `/households/${householdId}/children`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(list.statusCode).toBe(200);
      const listed = (list.json() as { children: { id: string }[] }).children;
      expect(listed.some((c) => c.id === child.id)).toBe(true);

      await app.inject({
        method: "PATCH",
        url: `/households/${householdId}/children/${child.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { archived: true },
      });

      const listAfter = await app.inject({
        method: "GET",
        url: `/households/${householdId}/children`,
        headers: { authorization: `Bearer ${token}` },
      });
      const still = (
        listAfter.json() as { children: { id: string }[] }
      ).children.some((c) => c.id === child.id);
      expect(still).toBe(false);

      const withArchived = await app.inject({
        method: "GET",
        url: `/households/${householdId}/children?includeArchived=true`,
        headers: { authorization: `Bearer ${token}` },
      });
      const allKids = (withArchived.json() as { children: { id: string }[] })
        .children;
      expect(allKids.some((c) => c.id === child.id)).toBe(true);
    });

    it("CRUD providers", async () => {
      const { token, householdId } = await register(app, "prov");

      const create = await app.inject({
        method: "POST",
        url: `/households/${householdId}/providers`,
        headers: { authorization: `Bearer ${token}` },
        payload: { name: "Coach Kim" },
      });
      expect(create.statusCode).toBe(201);
      const id = (create.json() as { provider: { id: string } }).provider.id;

      const one = await app.inject({
        method: "GET",
        url: `/households/${householdId}/providers/${id}`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(one.statusCode).toBe(200);

      const patch = await app.inject({
        method: "PATCH",
        url: `/households/${householdId}/providers/${id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { notes: "Court 2" },
      });
      expect(patch.statusCode).toBe(200);
    });

    it("returns 403 when user is not a member of the household", async () => {
      const a = await register(app, "a403");
      const b = await register(app, "b403");

      const res = await app.inject({
        method: "GET",
        url: `/households/${a.householdId}/children`,
        headers: { authorization: `Bearer ${b.token}` },
      });
      expect(res.statusCode).toBe(403);

      const res2 = await app.inject({
        method: "GET",
        url: `/households/${a.householdId}/providers`,
        headers: { authorization: `Bearer ${b.token}` },
      });
      expect(res2.statusCode).toBe(403);
    });
  }
);
