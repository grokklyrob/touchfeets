import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authConfig } from "@/app/api/auth/[...nextauth]/route";
import prisma from "@/lib/prisma";
import { getOrCreateQuota, monthUtc } from "@/lib/entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function hasId(user: any): user is { id: string } {
  return !!user && typeof user.id === "string";
}

/**
 * GET /api/usage
 * Returns current user's usage and tier for the active UTC month.
 * Response:
 * {
 *   month: "YYYY-MM",
 *   tier: "FREE" | "BASIC_50" | "PLUS_200" | "PRO_1000",
 *   freeRemaining: number,
 *   paidRemaining: number,
 *   watermarkExempt: boolean
 * }
 */
export async function GET() {
  const session = await getServerSession(authConfig);
  if (!session?.user || !hasId(session.user)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  // Determine current tier from active/trialing subscription if present; else FREE
  const sub = await prisma.subscription.findFirst({
    where: { userId, status: { in: ["active", "trialing"] } },
    orderBy: { updatedAt: "desc" },
    select: { planTier: true },
  });

  const m = monthUtc();
  const q = await getOrCreateQuota(userId, m);

  return NextResponse.json({
    month: m,
    tier: sub?.planTier ?? "FREE",
    freeRemaining: q.freeRemaining ?? 0,
    paidRemaining: q.paidRemaining ?? 0,
    watermarkExempt: q.watermarkExempt ?? false,
  });
}