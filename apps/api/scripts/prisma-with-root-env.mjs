/**
 * Loads repo-root `.env` then `apps/api/.env` (later overrides), then runs Prisma CLI.
 * Prisma only auto-loads `apps/api/.env`; the monorepo convention is `.env` at the repo root.
 */
import { config } from "dotenv";
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

config({ path: resolve(apiRoot, "../../.env") });
config({ path: resolve(apiRoot, ".env") });

const prismaArgs = process.argv.slice(2);
const result = spawnSync(
  "pnpm",
  ["exec", "prisma", ...prismaArgs],
  { stdio: "inherit", cwd: apiRoot, shell: true, env: process.env }
);
process.exit(result.status === null ? 1 : result.status);
