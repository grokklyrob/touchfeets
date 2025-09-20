import { NextResponse } from "next/server";
import Stripe from "stripe";
import prisma from "@/lib/prisma";
import { applyEntitlementsForSubscription } from "@/lib/entitlements";
import { tryAcquireIdempotency, stripeEventLockKey } from "@/lib/redis";

export const runtime = "nodejs";
// Ensure this route is always executed on the server
export const dynamic = "force-dynamic";

/**
 * Stripe client. Do not pin apiVersion here to avoid TS literal mismatch warnings.
 * The key must be set in STRIPE_SECRET_KEY.
 */
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "");

/**
 * Helper: create-or-check idempotency using our WebhookEvent unique stripeEventId index.
 * Returns false if the event was already processed.
 */
async function recordWebhookEvent(event: Stripe.Event) {
  try {
    await prisma.webhookEvent.create({
      data: {
        type: event.type,
        stripeEventId: event.id,
        payloadJson: event as unknown as any,
        status: "received",
      },
    });
    return true;
  } catch (err: any) {
    // Unique violation means we already processed/recorded this event
    return false;
  }
}

async function markProcessed(eventId: string, status: string) {
  try {
    await prisma.webhookEvent.update({
      where: { stripeEventId: eventId },
      data: { status, processedAt: new Date() },
    });
  } catch {
    // best-effort
  }
}

/**
 * Normalize plan + period details from a subscription id
 */
async function fetchSubscriptionDetails(subscriptionId: string) {
  // Some Stripe SDK versions type retrieve() as Stripe.Response<Subscription>.
  // Treat it as Subscription for convenience to avoid TS literal mismatches.
  const subResp = await stripe.subscriptions.retrieve(subscriptionId);
  const sub = subResp as unknown as Stripe.Subscription;

  const price = sub.items.data[0]?.price?.id ?? null;
  return {
    status: sub.status,
    stripeCustomerId: typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null,
    stripeSubscriptionId: sub.id,
    stripePriceId: price,
    currentPeriodStart:
      // Stripe uses epoch seconds
      (sub as any).current_period_start ? new Date((sub as any).current_period_start * 1000) : null,
    currentPeriodEnd:
      (sub as any).current_period_end ? new Date((sub as any).current_period_end * 1000) : null,
    anchorUtcDay: 1, // design choice: quotas anchored to 1st of month UTC
  } as const;
}

/**
 * Resolve a userId from our DB by Stripe customer id
 */
async function findUserIdByCustomerId(customerId: string | null | undefined) {
  if (!customerId) return null;
  const sub = await prisma.subscription.findFirst({
    where: { stripeCustomerId: customerId },
    select: { userId: true },
  });
  return sub?.userId ?? null;
}

/**
 * This webhook expects:
 * - STRIPE_WEBHOOK_SECRET set to your signing secret
 */
export async function POST(req: Request) {
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing Stripe-Signature header" }, { status: 400 });
  }
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Missing STRIPE_WEBHOOK_SECRET" }, { status: 500 });
  }

  let event: Stripe.Event;
  try {
    const rawBody = await req.text();
    event = stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch (err: any) {
    return NextResponse.json({ error: `Invalid webhook: ${err.message}` }, { status: 400 });
  }

  // Redis-based idempotency pre-check (fast path)
  const acquired = await tryAcquireIdempotency(stripeEventLockKey(event.id));
  if (!acquired) {
    return NextResponse.json({ ok: true, deduped: true, via: "redis" });
  }

  // Idempotency recording
  const isNew = await recordWebhookEvent(event);
  if (!isNew) {
    // Already processed
    return NextResponse.json({ ok: true, deduped: true });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const subId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
        if (subId) {
          const details = await fetchSubscriptionDetails(subId);
          const userId = await findUserIdByCustomerId(details.stripeCustomerId);
          if (userId) {
            await applyEntitlementsForSubscription({
              userId,
              status: details.status,
              stripeCustomerId: details.stripeCustomerId,
              stripeSubscriptionId: details.stripeSubscriptionId,
              stripePriceId: details.stripePriceId,
              currentPeriodStart: details.currentPeriodStart,
              currentPeriodEnd: details.currentPeriodEnd,
              anchorUtcDay: details.anchorUtcDay,
            });
          }
        }
        break;
      }

      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as unknown as Stripe.Subscription & {
          current_period_start?: number;
          current_period_end?: number;
        };
        const priceId = sub.items?.data?.[0]?.price?.id ?? null;
        const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null;
        const userId = await findUserIdByCustomerId(customerId);
        if (userId) {
          await applyEntitlementsForSubscription({
            userId,
            status: sub.status,
            stripeCustomerId: customerId,
            stripeSubscriptionId: sub.id,
            stripePriceId: priceId,
            currentPeriodStart: sub.current_period_start ? new Date(sub.current_period_start * 1000) : null,
            currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000) : null,
            anchorUtcDay: 1,
          });
        }
        break;
      }

      case "invoice.payment_failed": {
        // Some SDK versions type Invoice without 'subscription' field; widen to any
        const invoice = event.data.object as unknown as {
          subscription?: string | Stripe.Subscription | null;
          customer?: string | Stripe.Customer | null;
        };
        const subId =
          typeof invoice.subscription === "string"
            ? invoice.subscription
            : (invoice.subscription as Stripe.Subscription | undefined)?.id;

        if (subId) {
          const details = await fetchSubscriptionDetails(subId);
          const userId = await findUserIdByCustomerId(details.stripeCustomerId);
          if (userId) {
            await applyEntitlementsForSubscription({
              userId,
              status: "past_due",
              stripeCustomerId: details.stripeCustomerId,
              stripeSubscriptionId: details.stripeSubscriptionId,
              stripePriceId: details.stripePriceId,
              currentPeriodStart: details.currentPeriodStart,
              currentPeriodEnd: details.currentPeriodEnd,
              anchorUtcDay: details.anchorUtcDay,
            });
          }
        }
        break;
      }

      default:
        // No-op for unhandled events
        break;
    }

    await markProcessed(event.id, "processed");
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("webhook processing error", err);
    await markProcessed(event.id, "failed");
    return NextResponse.json({ error: err?.message ?? "Webhook failed" }, { status: 500 });
  }
}