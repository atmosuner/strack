import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(3333),
  HOST: z.string().default("0.0.0.0"),
  /** Required when using Prisma (database, Task 2+). Health-only can still run without it. */
  DATABASE_URL: z.string().min(1).optional(),
  /** HS256 secret for JWT. Override in production. */
  JWT_SECRET: z
    .string()
    .min(16)
    .default("dev-only-jwt-secret-change-me"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function getEnv(): Env {
  if (!cached) {
    cached = schema.parse(process.env);
  }
  return cached;
}

export function resetEnvCache(): void {
  cached = undefined;
}
