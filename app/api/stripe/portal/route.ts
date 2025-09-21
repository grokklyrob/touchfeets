import { NextResponse } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "");

/**
 * POST /api/stripe/portal
 * Body: { customerId: string }
 * Returns: { url: string }
 *
 * Note:
 * - In a later step we'll look up the Stripe customer ID by the authenticated user.
 * - For now, this route expects a customerId provided by the client/dashboard.
 */
export async function POST(req: Request) {
  try {
    const { customerId } = (await req.json().catch(() => ({}))) as {
      customerId?: string;
    };

    if (!customerId) {
      return NextResponse.json(
        { error: "Missing customerId" },
        { status: 400 }
      );
    }

    const origin =
      req.headers.get("origin") ||
      process.env.NEXTAUTH_URL ||
      "http://localhost:3000";

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/dashboard`,
    });

    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (err: unknown) {
    console.error("portal-session error", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create portal session" },
      { status: 500 }
    );
  }
}