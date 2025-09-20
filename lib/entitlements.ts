import prisma from "@/lib/prisma";

type PlanTier = "FREE" | "BASIC_50" | "PLUS_200" | "PRO_1000";

/**
 * Quota and watermark policy per tier.
 * FREE: visible watermark required
 * Paid tiers: watermarkExempt = true (no visible overlay)
 */
export const PLAN_DEFAULTS: Record<PlanTier, { monthlyQuota: number; watermarkExempt: boolean }> = {
  FREE: { monthlyQuota: 5, watermarkExempt: false },
  BASIC_50: { monthlyQuota: 50, watermarkExempt: true },
  PLUS_200: { monthlyQuota: 200, watermarkExempt: true },
  PRO_1000: { monthlyQuota: 1000, watermarkExempt: true },
};

/**
 * Map from Stripe Price ID (env) to PlanTier.
 * Configure in environment:
 *  - PRICE_ID_BASIC_50
 *  - PRICE_ID_PLUS_200
 *  - PRICE_ID_PRO_1000
 */
export function planFromStripePriceId(priceId: string | null | undefined): PlanTier {
  const basic = process.env.PRICE_ID_BASIC_50;
  const plus = process.env.PRICE_ID_PLUS_200;
  const pro = process.env.PRICE_ID_PRO_1000;
  if (priceId && basic && priceId === basic) return "BASIC_50";
  if (priceId && plus && priceId === plus) return "PLUS_200";
  if (priceId && pro && priceId === pro) return "PRO_1000";
  return "FREE";
}

/**
 * Format current month in UTC as YYYY-MM
 */
export function monthUtc(date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  return `${y}-${m}`;
}

/**
 * Ensure a quota row exists for the user for the given month.
 */
export async function getOrCreateQuota(userId: string, month = monthUtc()) {
  let q = await prisma.quota.findUnique({
    where: { userId_monthUtc: { userId, monthUtc: month } },
  });
  if (!q) {
    q = await prisma.quota.create({
      data: {
        userId,
        monthUtc: month,
        freeRemaining: PLAN_DEFAULTS["FREE"].monthlyQuota,
        paidRemaining: 0,
        watermarkExempt: false,
      },
    });
  }
  return q;
}

/**
 * Update user entitlements when subscription status/price changes.
 * Called from Stripe webhook handlers for checkout.session.completed,
 * customer.subscription.updated, customer.subscription.deleted, invoice.payment_failed, etc.
 *
 * Behavior:
 * - If active subscription with a recognized price:
 *    - Set tier to mapped tier; set paidRemaining to full tier quota for current month.
 *    - watermarkExempt = true for paid tiers.
 * - If no active subscription:
 *    - Revert to FREE: keep or reset freeRemaining (up to default), set paidRemaining = 0, watermarkExempt = false.
 *
 * Note: This function sets the "starting point" for the current month. Decrements occur per-generation elsewhere.
 */
export async function applyEntitlementsForSubscription(opts: {
  userId: string;
  status: "trialing" | "active" | "past_due" | "canceled" | "unpaid" | "incomplete" | "incomplete_expired" | "paused" | string;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  stripePriceId?: string | null;
  currentPeriodStart?: Date | null;
  currentPeriodEnd?: Date | null;
  anchorUtcDay?: number | null;
}) {
  const {
    userId,
    status,
    stripeCustomerId,
    stripeSubscriptionId,
    stripePriceId,
    currentPeriodStart,
    currentPeriodEnd,
    anchorUtcDay,
  } = opts;

  const tier = status === "active" || status === "trialing"
    ? planFromStripePriceId(stripePriceId)
    : "FREE";

  // Upsert subscription record (metadata for audit)
  await prisma.subscription.upsert({
    where: { stripeSubscriptionId: stripeSubscriptionId ?? "" },
    update: {
      userId,
      status,
      planTier: tier,
      stripeCustomerId: stripeCustomerId ?? undefined,
      stripePriceId: stripePriceId ?? undefined,
      currentPeriodStart: currentPeriodStart ?? undefined,
      currentPeriodEnd: currentPeriodEnd ?? undefined,
      anchorUtcDay: anchorUtcDay ?? undefined,
    },
    create: {
      userId,
      status,
      planTier: tier,
      stripeCustomerId: stripeCustomerId ?? undefined,
      stripeSubscriptionId: stripeSubscriptionId ?? undefined,
      stripePriceId: stripePriceId ?? undefined,
      currentPeriodStart: currentPeriodStart ?? undefined,
      currentPeriodEnd: currentPeriodEnd ?? undefined,
      anchorUtcDay: anchorUtcDay ?? undefined,
    },
  });

  // Bring quotas in sync for current month
  const m = monthUtc();
  const q = await getOrCreateQuota(userId, m);

  if (tier === "FREE") {
    // Revert to free entitlements
    const targetFree = PLAN_DEFAULTS["FREE"].monthlyQuota;
    await prisma.quota.update({
      where: { id: q.id },
      data: {
        // If user already used some free; do not increase above monthly default
        freeRemaining: Math.min(q.freeRemaining ?? 0, targetFree),
        paidRemaining: 0,
        watermarkExempt: false,
      },
    });
  } else {
    const { monthlyQuota, watermarkExempt } = PLAN_DEFAULTS[tier];
    await prisma.quota.update({
      where: { id: q.id },
      data: {
        // Preserve remaining free, add paidRemaining fresh for the month anchor
        paidRemaining: monthlyQuota,
        watermarkExempt,
      },
    });
  }

  // Audit log
  await prisma.auditLog.create({
    data: {
      userId,
      action: "ENTITLEMENTS_SYNC",
      contextJson: {
        status,
        stripeCustomerId,
        stripeSubscriptionId,
        stripePriceId,
        resolvedTier: tier,
        month: m,
      } as unknown as any,
    },
  });

  return { tier };
}

/**
 * Decrement quota for a generation attempt. This is called from the generate route.
 * - Paid users consume from paidRemaining. When it's 0, fallback to freeRemaining if available (still watermarked=false as long as watermarkExempt is true).
 * - Free users consume from freeRemaining only. If 0, reject upstream.
 */
export async function decrementQuota(userId: string) {
  const m = monthUtc();
  const q = await getOrCreateQuota(userId, m);

  if (q.paidRemaining > 0) {
    return prisma.quota.update({
      where: { id: q.id },
      data: { paidRemaining: { decrement: 1 } },
    });
  }

  if (q.freeRemaining > 0) {
    return prisma.quota.update({
      where: { id: q.id },
      data: { freeRemaining: { decrement: 1 } },
    });
  }

  throw new Error("Quota exceeded for the current month");
}

/**
 * Helper to check whether visible watermark overlay should be applied.
 */
export async function isWatermarkExempt(userId: string) {
  const q = await prisma.quota.findFirst({
    where: { userId, monthUtc: monthUtc() },
    select: { watermarkExempt: true },
  });
  return q?.watermarkExempt ?? false;
}