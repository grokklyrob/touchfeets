import { GoogleGenerativeAI } from "@google/generative-ai";
import sharp from "sharp";

/**
 * Supported style presets for generation.
 */
export type StylePreset = "BYZANTINE" | "GOTHIC" | "CYBERPUNK";

export type GenerationOptions = {
  outputFormat?: "png" | "webp";
  model?: string;
  promptVariant?: string;
  /**
   * Max edge (px) the input will be resized to before sending to the model.
   * Helps keep cost/perf stable. Defaults to 1024.
   */
  maxEdge?: number;
};

export class SafetyBlockedError extends Error {
  code = "SAFETY_BLOCK";
  constructor(message = "Generation blocked by safety filters") {
    super(message);
    this.name = "SafetyBlockedError";
  }
}

/**
 * Resolve model id, allowing override via env.
 * Updated to use the correct available model name.
 */
export function getGeminiModelId(): string {
  return process.env.GEMINI_IMAGE_MODEL?.trim() || "gemini-2.5-flash-image-preview";
}

/**
 * Generate an instruction prompt based on style preset and optional variant.
 */
export function buildPrompt(style: StylePreset, promptVariant?: string): string {
  const base =
    "Analyze the input image and automatically select regions for seamless inpainting. " +
    "Localize human feet and preserve their visibility, toes, placement, perspective, shadows, and proportions. " +
    "Integrate a tasteful, respectful depiction of Jesus Christ into the scene with natural composition and blending. " +
    "Do not crop or obscure the feet. Match scene lighting, color palette, depth of field, and camera perspective. " +
    "Avoid grotesque or offensive elements. High quality, photoreal or stylized per art direction.";

  let styleLine = "";
  switch (style) {
    case "BYZANTINE":
      styleLine = "Art direction: Byzantine iconography, gold leaf halos, flat stylization, sacred motifs; icon-like composition.";
      break;
    case "GOTHIC":
      styleLine = "Art direction: Gothic illuminated manuscript, intricate linework, stained glass color palette; ornamental details.";
      break;
    case "CYBERPUNK":
      styleLine = "Art direction: Cyberpunk neon glow, holographic halo, futuristic garments, moody ambient lighting; cinematic contrast.";
      break;
  }

  const variant = (promptVariant || "").trim();
  const variantLine = variant ? `Creative direction: ${variant}` : "";

  const constraints =
    "Constraints: fully automatic masking and inpainting; no user mask; no foot occlusion; preserve composition; seamless integration.";

  return [base, styleLine, variantLine, constraints].filter(Boolean).join(" ");
}

/**
 * Convert Sharp metadata format to a mime type.
 */
function mimeFromSharpFormat(fmt?: string | null): string {
  switch ((fmt || "").toLowerCase()) {
    case "jpeg":
    case "jpg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "heic":
      return "image/heic";
    case "heif":
      return "image/heif";
    default:
      return "image/png";
  }
}

/**
 * Convert output format to Sharp's toFormat() argument and corresponding mime.
 */
function formatToSharp(format: "png" | "webp"): { sharpFormat: "png" | "webp"; mime: string } {
  if (format === "webp") return { sharpFormat: "webp", mime: "image/webp" };
  return { sharpFormat: "png", mime: "image/png" };
}

/**
 * Prepare input image:
 * - Ensure max dimension not exceeding maxEdge (fit: inside, no enlargement).
 * - Preserve/normalize reasonable mime type.
 */
async function prepareInputBytes(input: Uint8Array, maxEdge: number): Promise<{ bytes: Uint8Array; mime: string }> {
  const base = Buffer.isBuffer(input) ? input : Buffer.from(input);
  const img = sharp(base, { failOn: "none" });

  const resized = await img
    .resize({
      width: maxEdge,
      height: maxEdge,
      fit: "inside",
      withoutEnlargement: true,
      fastShrinkOnLoad: true,
    })
    .toBuffer();

  let fmt: string | null = null;
  try {
    const m = await sharp(resized).metadata();
    fmt = m.format || null;
  } catch {
    fmt = "png";
  }
  const mime = mimeFromSharpFormat(fmt);
  return { bytes: resized, mime };
}

/**
 * Extract base64 image inlineData from a generative response.
 * Handles both text and image generation model responses.
 */
function extractInlineImageBase64(resp: unknown): { b64: string; mime?: string } | null {
  try {
    const candidates = (resp as { candidates?: unknown[] })?.candidates || [];
    for (const c of candidates) {
      const parts = (c as { content?: { parts?: unknown[] } })?.content?.parts || [];
      for (const p of parts) {
        // Try inlineData first (for image generation models)
        if ((p as { inlineData?: { data?: string; mimeType?: string } })?.inlineData?.data) {
          const inlineData = (p as { inlineData: { data: string; mimeType?: string } }).inlineData;
          return { b64: inlineData.data, mime: inlineData.mimeType };
        }

        // Try text content that might contain base64 data
        if ((p as { text?: string })?.text) {
          const text = (p as { text: string }).text;
          // Look for base64 image data in text response
          const base64Match = text.match(/data:image\/[^;]+;base64,([^"'\s]+)/);
          if (base64Match) {
            return { b64: base64Match[1] };
          }
        }
      }
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Generate a styled image integrating Jesus and preserving feet localization using Gemini images.
 * - If the model returns no inline image, throws an error.
 * - If safety filters trigger, throws SafetyBlockedError.
 * - Output is normalized to requested outputFormat with Sharp.
 */
export async function generateStyledJesusFeet(
  input: Uint8Array,
  style: StylePreset,
  opts?: GenerationOptions
): Promise<{ bytes: Uint8Array; contentType: string }> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_API_KEY is not configured");
  }

  const modelId = (opts?.model || getGeminiModelId()).trim();
  const outputFormat = opts?.outputFormat || "png";
  const maxEdge = typeof opts?.maxEdge === "number" ? Math.max(256, Math.min(2048, opts.maxEdge)) : 1024;

  // Prepare input bytes for stable size/cost
  const prepared = await prepareInputBytes(input, maxEdge);
  const inputB64 = Buffer.from(prepared.bytes).toString("base64");
  const inputMime = prepared.mime || "image/png";

  const prompt = buildPrompt(style, opts?.promptVariant);

  const genai = new GoogleGenerativeAI(apiKey);
  const model = genai.getGenerativeModel({ model: modelId });

  // Assemble content parts (prompt + inline image). Mask-edit flows could be added later.
  const contents = [
    prompt,
    { inlineData: { data: inputB64, mimeType: inputMime } },
  ];

  // Call model
  let result: unknown;
  try {
    console.log(`Calling model: ${modelId}`);
    console.log(`Content structure:`, JSON.stringify(requestContents, null, 2));

    result = await model.generateContent({ contents: requestContents });

    console.log(`Model response received:`, typeof result);
  } catch (err: unknown) {
    // Some SDK versions throw on safety blocks or quota
    const msg = err instanceof Error ? err.message : "Model generateContent failed";
    console.error(`Model call failed: ${msg}`);
    console.error(`Full error:`, err);

    if (/safety/i.test(msg)) {
      throw new SafetyBlockedError();
    }
    throw err;
    }
  // Safety and media extraction
  const resp = (result as { response?: unknown }).response ?? result;
  const img = extractInlineImageBase64(resp);
  if (!img) {
    const safety = (resp as { promptFeedback?: { safetyRatings?: unknown }; candidates?: { safetyRatings?: unknown }[] })?.promptFeedback?.safetyRatings || (resp as { candidates?: { safetyRatings?: unknown }[] })?.candidates?.[0]?.safetyRatings;
    if (safety) {
      throw new SafetyBlockedError();
    }
    throw new Error("Model did not return an image payload");
  }

  const rawBytes = Buffer.from(img.b64, "base64");
  const { sharpFormat, mime } = formatToSharp(outputFormat);
  const normalized = await sharp(rawBytes).toFormat(sharpFormat).toBuffer();
  return { bytes: normalized, contentType: mime };
}