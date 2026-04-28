import type { FastifyPluginAsync } from "fastify";
import Stripe from "stripe";
import { z } from "zod";

import { getPrisma } from "../db.js";
import { authenticate } from "../middleware/authenticate.js";

const STRIPE_ENABLED = Boolean(
  process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY.length > 0
);

let _stripe: Stripe | null = null;
function getStripe(): Stripe | null {
  if (!STRIPE_ENABLED) return null;
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  }
  return _stripe;
}

const checkoutBody = z.object({
  householdId: z.string().uuid(),
  priceId: z.string().min(1).max(200),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
});

export const stripeRoutes: FastifyPluginAsync = async (app) => {
  // Feature flag check
  app.get("/status", async () => ({
    enabled: Boolean(STRIPE_ENABLED),
    message: STRIPE_ENABLED
      ? "Stripe is configured"
      : "Stripe is not configured — set STRIPE_SECRET_KEY to enable",
  }));

  // Create checkout session (owner only)
  app.post("/checkout", { preHandler: [authenticate] }, async (request, reply) => {
    if (!STRIPE_ENABLED) {
      return reply.status(503).send({
        error: { code: "ServiceUnavailable", message: "Stripe is not configured" },
      });
    }

    const parse = checkoutBody.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ error: { code: "BadRequest", message: parse.error.message } });
    }

    const jwtUser = request.user as { sub: string; email: string };
    const prisma = getPrisma();

    const membership = await prisma.householdMember.findFirst({
      where: { householdId: parse.data.householdId, userId: jwtUser.sub, role: "OWNER" },
    });
    if (!membership) {
      return reply.status(403).send({
        error: { code: "Forbidden", message: "Only the household owner can manage billing" },
      });
    }

    // Get or create Stripe customer
    const stripe = getStripe()!;
    let user = await prisma.user.findUnique({ where: { id: jwtUser.sub } });
    if (!user) {
      return reply.status(404).send({ error: { code: "NotFound", message: "User not found" } });
    }

    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: jwtUser.email,
        metadata: { userId: jwtUser.sub, householdId: parse.data.householdId },
      });
      customerId = customer.id;
      await prisma.user.update({
        where: { id: jwtUser.sub },
        data: { stripeCustomerId: customerId },
      });
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: parse.data.priceId, quantity: 1 }],
      success_url: parse.data.successUrl,
      cancel_url: parse.data.cancelUrl,
      metadata: { householdId: parse.data.householdId },
    });

    await prisma.stripePayment.create({
      data: {
        householdId: parse.data.householdId,
        stripeSessionId: session.id,
        amountCents: 0,
        status: "pending",
        description: "Subscription checkout",
      },
    });

    return { url: session.url, sessionId: session.id };
  });

  // Stripe webhook
  app.post("/webhook", {
    config: { rawBody: true },
  }, async (request, reply) => {
    if (!STRIPE_ENABLED) {
      return reply.status(503).send({ error: { code: "ServiceUnavailable", message: "Stripe not configured" } });
    }

    const stripe = getStripe()!;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const sig = (request.headers as Record<string, string>)["stripe-signature"];

    if (!webhookSecret || !sig) {
      return reply.status(400).send({ error: { code: "BadRequest", message: "Missing signature" } });
    }

    let event;
    try {
      const rawBody = (request as unknown as Record<string, unknown>).rawBody as string;
      event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    } catch {
      return reply.status(400).send({ error: { code: "BadRequest", message: "Webhook signature verification failed" } });
    }

    const prisma = getPrisma();

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const householdId = session.metadata?.householdId;
        if (householdId) {
          await prisma.household.update({
            where: { id: householdId },
            data: {
              stripeSubscriptionId: session.subscription as string,
              subscriptionStatus: "ACTIVE",
            },
          });
          await prisma.stripePayment.updateMany({
            where: { stripeSessionId: session.id },
            data: {
              status: "completed",
              stripePaymentIntent: session.payment_intent as string ?? null,
            },
          });
        }
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object;
        const household = await prisma.household.findFirst({
          where: { stripeSubscriptionId: sub.id },
        });
        if (household) {
          const statusMap: Record<string, string> = {
            active: "ACTIVE",
            trialing: "TRIAL",
            past_due: "PAST_DUE",
            canceled: "CANCELLED",
            unpaid: "PAST_DUE",
          };
          const mapped = statusMap[sub.status] ?? "NONE";
          await prisma.household.update({
            where: { id: household.id },
            data: { subscriptionStatus: mapped as "ACTIVE" | "TRIAL" | "PAST_DUE" | "CANCELLED" | "NONE" },
          });
        }
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object;
        await prisma.household.updateMany({
          where: { stripeSubscriptionId: sub.id },
          data: { subscriptionStatus: "CANCELLED", stripeSubscriptionId: null },
        });
        break;
      }
    }

    return { received: true };
  });

  // Get billing status for a household (owner only)
  app.get("/billing/:householdId", { preHandler: [authenticate] }, async (request, reply) => {
    const { householdId } = request.params as { householdId: string };
    const jwtUser = request.user as { sub: string };
    const prisma = getPrisma();

    const membership = await prisma.householdMember.findFirst({
      where: { householdId, userId: jwtUser.sub, role: "OWNER" },
    });
    if (!membership) {
      return reply.status(403).send({
        error: { code: "Forbidden", message: "Only the owner can view billing" },
      });
    }

    const household = await prisma.household.findUnique({
      where: { id: householdId },
      select: { subscriptionStatus: true, stripeSubscriptionId: true },
    });

    const payments = await prisma.stripePayment.findMany({
      where: { householdId },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    return {
      stripeEnabled: Boolean(STRIPE_ENABLED),
      subscription: {
        status: household?.subscriptionStatus ?? "NONE",
        id: household?.stripeSubscriptionId ?? null,
      },
      recentPayments: payments,
    };
  });

  // Create portal session (owner only — manage subscription)
  app.post("/portal", { preHandler: [authenticate] }, async (request, reply) => {
    if (!STRIPE_ENABLED) {
      return reply.status(503).send({ error: { code: "ServiceUnavailable", message: "Stripe not configured" } });
    }

    const { householdId, returnUrl } = request.body as { householdId?: string; returnUrl?: string };
    if (!householdId || !returnUrl) {
      return reply.status(400).send({ error: { code: "BadRequest", message: "householdId and returnUrl required" } });
    }

    const jwtUser = request.user as { sub: string };
    const prisma = getPrisma();

    const membership = await prisma.householdMember.findFirst({
      where: { householdId, userId: jwtUser.sub, role: "OWNER" },
    });
    if (!membership) {
      return reply.status(403).send({ error: { code: "Forbidden", message: "Only the owner can manage billing" } });
    }

    const user = await prisma.user.findUnique({ where: { id: jwtUser.sub } });
    if (!user?.stripeCustomerId) {
      return reply.status(400).send({ error: { code: "BadRequest", message: "No Stripe customer. Create a checkout first." } });
    }

    const stripe = getStripe()!;
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: returnUrl,
    });

    return { url: portalSession.url };
  });
};
