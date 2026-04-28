import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

let prisma: PrismaClient | undefined;

export function getPrisma(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is required for database access");
  }
  if (!prisma) {
    const pool = new Pool({ connectionString: url });
    const adapter = new PrismaNeon(pool);
    prisma = new PrismaClient({ adapter } as any);
  }
  return prisma;
}

export async function disconnectPrisma(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = undefined;
  }
}

/** Reset singleton (e.g. integration tests after container stop). */
export function resetPrismaForTests(): void {
  prisma = undefined;
}
