import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { disconnectPrisma, getPrisma, resetPrismaForTests } from "./db.js";
import { createHouseholdWithOwner } from "./services/householdBootstrap.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const apiRoot = join(__dirname, "..");

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDatabaseUrl)(
  "household: User + Household + HouseholdMember (integration)",
  () => {
    beforeAll(async () => {
      process.env.NODE_ENV = "test";

      execSync("pnpm exec prisma migrate deploy", {
        cwd: apiRoot,
        env: process.env,
        stdio: "inherit",
      });
    }, 120_000);

    afterAll(async () => {
      await disconnectPrisma();
      resetPrismaForTests();
    }, 30_000);

    it("creates household with owner membership", async () => {
      const email = `owner-${Date.now()}@example.com`;
      const { userId, householdId } = await createHouseholdWithOwner({
        email,
        householdName: "Test household",
      });

      expect(userId).toBeTruthy();
      expect(householdId).toBeTruthy();

      const prisma = getPrisma();
      const member = await prisma.householdMember.findFirst({
        where: { householdId, userId, role: "OWNER" },
      });
      expect(member).not.toBeNull();
    });
  }
);
