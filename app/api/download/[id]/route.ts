import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authConfig } from "@/app/api/auth/[...nextauth]/route";
import prisma from "@/lib/prisma";
import { isWatermarkExempt } from "@/lib/entitlements";
import { applyVisibleWatermark } from "@/lib/watermark";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/download/[id]
 * Serves the generated image for the authenticated user's job.
 * - Paid (watermarkExempt) users receive the original output.
 * - Free users receive a visible watermarked version ("touchfeets.com" bottom-center).
 *
 * Notes:
 * - Requires job status COMPLETED and an outputBlobUrl.
 * - Always proxies via server to avoid exposing direct blob URL and to apply watermark as needed.
 */
export async function GET(
  _req: Request,
  ctx: { params: { id: string } }
) {
  const session = await getServerSession(authConfig);
  const user = session?.user as { id?: string } | undefined;
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = user.id;

  const jobId = ctx.params?.id;
  if (!jobId) {
    return NextResponse.json({ error: "Missing job id" }, { status: 400 });
  }

  const job = await prisma.imageJob.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      userId: true,
      status: true,
      outputBlobUrl: true,
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
  if (!job.outputBlobUrl || job.status !== "COMPLETED") {
    return NextResponse.json({ error: "Not ready" }, { status: 409 });
  }

  // Detect content type via HEAD; fallback to image/png
  let contentType = "image/png";
  try {
    const head = await fetch(job.outputBlobUrl, { method: "HEAD" });
    const ct = head.headers.get("content-type");
    if (ct) contentType = ct;
  } catch {
    // ignore; fallback remains
  }

  // Fetch the image
  const res = await fetch(job.outputBlobUrl);
  if (!res.ok) {
    return NextResponse.json({ error: "Failed to fetch output image" }, { status: 502 });
  }
  const arrayBuf: ArrayBuffer = await res.arrayBuffer();
  let outAb: ArrayBuffer = arrayBuf;

  // Decide watermark visibility
  const exempt = await isWatermarkExempt(userId);
  // Default to original bytes

  if (!exempt) {
    // Apply visible watermark for free tier
    const wmBuf = await applyVisibleWatermark(new Uint8Array(arrayBuf), {
      text: "touchfeets.com",
      opacity: 0.55,
      marginPct: 0.05,
      fontSizePct: 0.045,
      fill: "#ffffff",
    });
    // Convert Node Buffer to a plain ArrayBuffer for Web Response body
    const copy = new Uint8Array(wmBuf.byteLength);
    copy.set(wmBuf);
    outAb = copy.buffer;
    // If we transformed, prefer a safe default content type
    // The watermark function attempts to preserve format, but keep original contentType if known
  }

  // Suggest a filename
  const filename = `touchfeets-${job.id}.${extFromContentType(contentType)}`;

  return new Response(outAb, {
    status: 200,
    headers: {
      "content-type": contentType,
      "content-disposition": `inline; filename="${filename}"`,
      "cache-control": "private, max-age=0, no-store",
    },
  });
}

function extFromContentType(ct: string): string {
  const mime = (ct || "").toLowerCase();
  if (mime.includes("jpeg")) return "jpg";
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("heic")) return "heic";
  if (mime.includes("heif")) return "heif";
  return "png";
}