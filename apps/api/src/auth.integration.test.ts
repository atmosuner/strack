import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { disconnectPrisma, resetPrismaForTests } from "./db.js";
import { resetEnvCache } from "./env.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const apiRoot = join(__dirname, "..");

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDatabaseUrl)("auth: register, login, /me (integration)", () => {
  let app: Awaited<ReturnType<typeof import("./server.js").buildApp>>;

  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? "integration-jwt-secret-16min";

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

  it("register returns token and /me returns household", async () => {
    const email = `auth-reg-${Date.now()}@example.com`;
    const password = "password12";

    const reg = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        email,
        password,
        householdName: "Auth test home",
      },
    });
    expect(reg.statusCode).toBe(200);
    const regJson = reg.json() as {
      token: string;
      userId: string;
      householdId: string;
    };
    expect(regJson.token).toBeTruthy();
    expect(regJson.householdId).toBeTruthy();

    const me = await app.inject({
      method: "GET",
      url: "/me",
      headers: { authorization: `Bearer ${regJson.token}` },
    });
    expect(me.statusCode).toBe(200);
    const meJson = me.json() as {
      user: { id: string; email: string };
      householdId: string;
    };
    expect(meJson.user.id).toBe(regJson.userId);
    expect(meJson.user.email).toBe(email);
    expect(meJson.householdId).toBe(regJson.householdId);
  });

  it("login returns token for existing user", async () => {
    const email = `auth-login-${Date.now()}@example.com`;
    const password = "password12";

    await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        email,
        password,
        householdName: "Login test",
      },
    });

    const log = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email, password },
    });
    expect(log.statusCode).toBe(200);
    const logJson = log.json() as { token: string; userId: string };
    expect(logJson.token).toBeTruthy();

    const me = await app.inject({
      method: "GET",
      url: "/me",
      headers: { authorization: `Bearer ${logJson.token}` },
    });
    expect(me.statusCode).toBe(200);
  });

  it("register with duplicate email returns 409", async () => {
    const email = `auth-dup-${Date.now()}@example.com`;
    const password = "password12";

    const first = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        email,
        password,
        householdName: "First",
      },
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        email,
        password,
        householdName: "Second",
      },
    });
    expect(second.statusCode).toBe(409);
  });
});
