import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { resetEnvCache } from "./env.js";

describe("GET /me without Authorization", () => {
  let app: Awaited<ReturnType<typeof import("./server.js").buildApp>>;

  beforeAll(async () => {
    process.env.JWT_SECRET = "unit-test-jwt-secret-min-16";
    resetEnvCache();
    const { buildApp } = await import("./server.js");
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
    resetEnvCache();
  });

  it("returns 401", async () => {
    const res = await app.inject({ method: "GET", url: "/me" });
    expect(res.statusCode).toBe(401);
    const body = res.json() as { error: { code: string } };
    expect(body.error.code).toBe("Unauthorized");
  });
});
