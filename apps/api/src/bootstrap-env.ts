import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const srcDir = dirname(fileURLToPath(import.meta.url));
const apiRoot = resolve(srcDir, "..");

config({ path: resolve(apiRoot, "../.env") });
config({ path: resolve(apiRoot, ".env") });
