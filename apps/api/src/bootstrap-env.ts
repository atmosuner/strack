import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const srcDir = dirname(fileURLToPath(import.meta.url));
const apiRoot = resolve(srcDir, "..");

const rootEnv = resolve(apiRoot, "../.env");
const localEnv = resolve(apiRoot, ".env");

if (existsSync(rootEnv)) config({ path: rootEnv });
if (existsSync(localEnv)) config({ path: localEnv });
