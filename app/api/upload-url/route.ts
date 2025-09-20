import { NextResponse } from "next/server";
import { put } from "@vercel/blob";

export const runtime = "nodejs";

/**
 * POST /api/upload-url
 * Accepts multipart/form-data with field "file" (image).
 * Uploads the file server-side to Vercel Blob and returns the blob URL + key.
 * Notes:
 * - This avoids client-side presigned URL complexity and keeps validation server-side.
 * - Enforce basic content-type and size checks here; full moderation occurs in /api/moderate.
 */
export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") || "";
    const isMultipart = contentType.toLowerCase().includes("multipart/form-data");
    if (!isMultipart) {
      return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing file field" }, { status: 400 });
    }

    // Basic validation
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
    if (!allowed.includes(file.type)) {
      return NextResponse.json({ error: "Unsupported content type" }, { status: 415 });
    }
    // 20 MB cap
    const maxBytes = 20 * 1024 * 1024;
    if (typeof file.size === "number" && file.size > maxBytes) {
      return NextResponse.json({ error: "File too large (max 20MB)" }, { status: 413 });
    }

    // Token is needed for server-side put when not using edge runtime
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) {
      return NextResponse.json({ error: "Blob token not configured" }, { status: 500 });
    }

    const safeName = (file.name || "upload").replace(/[^a-zA-Z0-9._-]/g, "_");
    const key = `uploads/${Date.now()}-${Math.random().toString(36).slice(2)}-${safeName}`;

    const uploaded = await put(key, file.stream(), {
      access: "public",
      token,
      contentType: file.type,
      addRandomSuffix: false,
    });

    // Return canonical info for downstream steps (moderation/generation)
    return NextResponse.json(
      {
        url: uploaded.url,
        pathname: uploaded.pathname,
        contentType: file.type,
        size: typeof file.size === "number" ? file.size : undefined,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("upload-url error", err);
    return NextResponse.json({ error: err?.message ?? "Upload failed" }, { status: 500 });
  }
}