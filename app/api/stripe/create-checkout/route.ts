import { NextResponse } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "");

/**
 * Map plan slug to Stripe Price ID from server env
 */
function resolvePriceId(plan: "basic" | "plus" | "pro"): string | null {
  switch (plan) {
    case "basic":
      return process.env.PRICE_ID_BASIC_50 ?? null;
    case "plus":
      return process.env.PRICE_ID_PLUS_200 ?? null;
    case "pro":
      return process.env.PRICE_ID_PRO_1000 ?? null;
    default:
      return null;
  }
}

/**
 * Compute the next 1st day of month at 00:00:00 UTC as a Unix timestamp
 * Used to anchor Stripe subscription billing cycle to the 1st UTC.
 */
function nextFirstOfMonthUtc(): number {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  // next month
  const firstNextMonth =
    month === 11
      ? new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0))
      : new Date(Date.UTC(year, month + 1, 1, 0, 0, 0));
  // If it's exactly the 1st already, anchor to today; otherwise next 1st
  const isFirstToday = now.getUTCDate() === 1;
  const anchorDate = isFirstToday
    ? new Date(Date.UTC(year, month, 1, 0, 0, 0))
    : firstNextMonth;
  return Math.floor(anchorDate.getTime() / 1000);
}

function getOrigin(req: Request): string {
  const hdr = req.headers.get("origin") || req.headers.get("x-forwarded-host");
  if (hdr?.startsWith("http")) return hdr;
  if (hdr) return `https://${hdr}`;
  return process.env.NEXTAUTH_URL || "http://localhost:3000";
}

export async function POST(req: Request) {
  try {
    const origin = getOrigin(req);
    const body = (await req.json().catch(() => ({}))) as {
      plan?: "basic" | "plus" | "pro";
    };

    const plan = body.plan;
    if (!plan || !["basic", "plus", "pro"].includes(plan)) {
      return NextResponse.json(
        { error: "Missing or invalid plan. Expected one of: basic, plus, pro." },
        { status: 400 }
      );
    }

    const priceId = resolvePriceId(plan);
    if (!priceId) {
      return NextResponse.json(
        { error: `Price ID not configured for plan '${plan}'.` },
        { status: 500 }
      );
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      allow_promotion_codes: true,
      success_url: `${origin}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pricing?canceled=true`,
      subscription_data: {
        billing_cycle_anchor: nextFirstOfMonthUtc(),
        proration_behavior: "create_prorations",
      },
      // Optionally collect tax
      // automatic_tax: { enabled: true },
    });

    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (err: unknown) {
    console.error("create-checkout error", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Checkout creation failed" },
      { status: 500 }
    );
  }
}