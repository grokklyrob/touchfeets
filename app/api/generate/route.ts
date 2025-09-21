import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authConfig } from "@/app/api/auth/[...nextauth]/route";
import prisma from "@/lib/prisma";
import { decrementQuota } from "@/lib/entitlements";
import { rateLimitKey, rateLimitWindow } from "@/lib/redis";
import { put } from "@vercel/blob";
import { z } from "zod";
import { generateStyledJesusFeet, SafetyBlockedError } from "@/lib/gemini";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/generate
 * Body:
 * {
 *   inputUrl: string (required, blob URL from /api/upload-url; must include "/uploads/"),
 *   style: "BYZANTINE" | "GOTHIC" | "CYBERPUNK",
 *   promptVariant?: string (optional, max 200),
 *   outputFormat?: "png" | "webp"
 * }
 *
 * Response: Always 200 with { id } for created job. Status/progress via /api/jobs/[id].
 */
const BodySchema = z.object({
  inputUrl: z
    .string()
    .url()
    .refine((u) => u.startsWith("https://") || u.startsWith("http://"), "URL must be http(s)")
    .refine((u) => u.includes("/uploads/"), "Invalid input URL: must be uploaded via /api/upload-url"),
  style: z.enum(["BYZANTINE", "GOTHIC", "CYBERPUNK"]),
  promptVariant: z.string().max(200).optional(),
  outputFormat: z.enum(["png", "webp"]).optional(),
});

function extFromContentType(ct: string): "png" | "webp" | "jpg" {
  const mime = (ct || "").toLowerCase();
  if (mime.includes("webp")) return "webp";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  return "png";
}

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | { [key: string]: JsonValue } | JsonValue[];

async function recordEvent(jobId: string, step: string, detailJson?: JsonValue) {
  try {
    await prisma.generationEvent.create({
      data: {
        jobId,
        step,
        detailJson: detailJson ?? undefined,
      },
    });
  } catch {
    // best-effort; do not throw
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authConfig);
  const user = session?.user as { id?: string } | undefined;
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = user.id;

  // Parse body
  let body: z.infer<typeof BodySchema>;
  try {
    const json = await req.json();
    body = BodySchema.parse(json);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "Invalid request", detail: msg }, { status: 400 });
  }

  // Create job in QUEUED so we always have an id to return
  const job = await prisma.imageJob.create({
    data: {
      userId,
      inputBlobUrl: body.inputUrl,
      style: body.style,
      promptVariant: body.promptVariant ?? null,
      status: "QUEUED",
    },
    select: { id: true },
  });
  const jobId = job.id;
  await recordEvent(jobId, "queued", { style: body.style });

  // Rate limit
  try {
    const rl = await rateLimitWindow(rateLimitKey("gen", userId), 60, 10);
    if (!rl.allowed) {
      await prisma.imageJob.update({
        where: { id: jobId },
        data: { status: "FAILED", blockedReason: "RATE_LIMITED" },
      });
      await recordEvent(jobId, "failed", { reason: "RATE_LIMITED", remaining: rl.remaining });
      return NextResponse.json({ id: jobId }, { status: 200 });
    }
  } catch {
    // fail-open on redis issues
  }

  // Decrement quota
  try {
    await decrementQuota(userId);
  } catch {
    await prisma.imageJob.update({
      where: { id: jobId },
      data: { status: "FAILED", blockedReason: "QUOTA_EXCEEDED" },
    });
    await recordEvent(jobId, "failed", { reason: "QUOTA_EXCEEDED" });
    return NextResponse.json({ id: jobId }, { status: 200 });
  }

  // Move to PROCESSING
  await prisma.imageJob.update({
    where: { id: jobId },
    data: { status: "PROCESSING" },
  });
  await recordEvent(jobId, "processing");

  // Download input
  try {
    await recordEvent(jobId, "download_input_start", { url: body.inputUrl });
    const res = await fetch(body.inputUrl);
    if (!res.ok) {
      throw new Error(`Failed to fetch input image: ${res.status}`);
    }
    const inputBytes = new Uint8Array(await res.arrayBuffer());
    await recordEvent(jobId, "download_input_success", { bytes: inputBytes.byteLength });

    // Automatic inpainting: no user-provided mask supported.

    // Call Gemini
    await recordEvent(jobId, "call_gemini_start", {
      model: process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image-preview",
      outputFormat: body.outputFormat || "png",
    });

    let generated: { bytes: Uint8Array; contentType: string };
    try {
      generated = await generateStyledJesusFeet(inputBytes, body.style, {
        outputFormat: body.outputFormat || "png",
        promptVariant: body.promptVariant,
        // maxEdge default inside helper
      });
      await recordEvent(jobId, "call_gemini_success", { contentType: generated.contentType, bytes: generated.bytes.byteLength });
    } catch (err) {
      if (err instanceof SafetyBlockedError) {
        await prisma.imageJob.update({
          where: { id: jobId },
          data: { status: "BLOCKED", blockedReason: "SAFETY" },
        });
        await recordEvent(jobId, "call_gemini_safety_blocked");
        return NextResponse.json({ id: jobId }, { status: 200 });
      }
      // Other model error
      await prisma.imageJob.update({
        where: { id: jobId },
        data: { status: "FAILED", blockedReason: "MODEL_ERROR" },
      });
      await recordEvent(jobId, "failed", { reason: "MODEL_ERROR" });
      return NextResponse.json({ id: jobId }, { status: 200 });
    }

    // Upload output to Blob
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) {
      await prisma.imageJob.update({
        where: { id: jobId },
        data: { status: "FAILED", blockedReason: "UPLOAD_NOT_CONFIGURED" },
      });
      await recordEvent(jobId, "failed", { reason: "UPLOAD_NOT_CONFIGURED" });
      return NextResponse.json({ id: jobId }, { status: 200 });
    }

    const ext = extFromContentType(generated.contentType);
    const key = `generated/${jobId}.${ext}`;

    await recordEvent(jobId, "upload_output_start", { key, ext });

    const uploaded = await put(key, Buffer.from(generated.bytes), {
      access: "public",
      token,
      contentType: generated.contentType,
      addRandomSuffix: false,
    });

    await recordEvent(jobId, "upload_output_success", { url: uploaded.url, pathname: uploaded.pathname });

    // Mark completed
    await prisma.imageJob.update({
      where: { id: jobId },
      data: {
        status: "COMPLETED",
        outputBlobUrl: uploaded.url,
        completedAt: new Date(),
      },
    });
    await recordEvent(jobId, "completed");

    return NextResponse.json({ id: jobId }, { status: 200 });
  } catch (err: unknown) {
    // Input fetch or unknown failure
    await prisma.imageJob.update({
      where: { id: jobId },
      data: { status: "FAILED", blockedReason: "INPUT_OR_UNKNOWN_ERROR" },
    });
    const msg = err instanceof Error ? err.message : String(err);
    await recordEvent(jobId, "failed", {
      reason: "INPUT_OR_UNKNOWN_ERROR",
      err: msg,
    });
    return NextResponse.json({ id: jobId }, { status: 200 });
  }
}