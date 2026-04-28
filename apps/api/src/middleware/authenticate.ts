import type { FastifyReply, FastifyRequest } from "fastify";

/** Requires `Authorization: Bearer <token>`. Attaches verified payload to `request.user`. */
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    await request.jwtVerify();
  } catch {
    return reply.status(401).send({
      error: {
        code: "Unauthorized",
        message: "Missing or invalid token",
      },
    });
  }
}
