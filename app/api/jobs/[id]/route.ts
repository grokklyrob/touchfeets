import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authConfig } from "@/app/api/auth/[...nextauth]/route";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/jobs/[id]
 * Returns job status and URLs for the authenticated user.
 * Response (200):
 * {
 *   id: string,
 *   status: "QUEUED" | "PROCESSING" | "BLOCKED" | "COMPLETED" | "FAILED",
 *   inputBlobUrl: string,
 *   outputBlobUrl?: string,
 *   style?: "BYZANTINE" | "GOTHIC" | "CYBERPUNK",
 *   blockedReason?: string | null,
 *   createdAt: string,
 *   completedAt?: string | null
 * }
 */
export async function GET(
  _req: Request,
  ctx: { params: { id: string } }
) {
  const session = await getServerSession(authConfig);
  if (!session?.user || typeof (session.user as any).id !== "string") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = (session.user as any).id as string;

  const jobId = ctx.params?.id;
  if (!jobId) {
    return NextResponse.json({ error: "Missing job id" }, { status: 400 });
  }

  const job = await prisma.imageJob.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      userId: true,
      inputBlobUrl: true,
      outputBlobUrl: true,
      status: true,
      style: true,
      blockedReason: true,
      createdAt: true,
      completedAt: true,
    },
  });

  if (!job) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (job.userId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    id: job.id,
    status: job.status,
    inputBlobUrl: job.inputBlobUrl,
    outputBlobUrl: job.outputBlobUrl ?? undefined,
    style: job.style ?? undefined,
    blockedReason: job.blockedReason ?? null,
    createdAt: job.createdAt.toISOString(),
    completedAt: job.completedAt ? job.completedAt.toISOString() : null,
  });
}