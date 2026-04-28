import "./bootstrap-env.js";

import { buildApp } from "./server.js";
import { disconnectPrisma } from "./db.js";
import { getEnv } from "./env.js";

const env = getEnv();
const port = env.PORT;
const host = env.HOST;

const app = await buildApp();

async function main(): Promise<void> {
  await app.listen({ port, host });
}

const shutdown = async (): Promise<void> => {
  await app.close();
  await disconnectPrisma();
};

process.on("SIGINT", () => {
  void shutdown().finally(() => process.exit(0));
});
process.on("SIGTERM", () => {
  void shutdown().finally(() => process.exit(0));
});

main().catch((err) => {
  app.log.error(err);
  process.exit(1);
});
