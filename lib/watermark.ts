import sharp from "sharp";

/**
 * Apply a visible bottom-center watermark to an image buffer.
 * - Uses SVG overlay for crisp text at any resolution.
 * - Semi-transparent text: "touchfeets.com" at bottom center.
 * - Returns a Buffer in the same format as input (fallback to PNG if unknown).
 */
export async function applyVisibleWatermark(
  input: Buffer | Uint8Array,
  opts?: {
    text?: string;
    opacity?: number; // 0..1
    marginPct?: number; // vertical margin from bottom in percent of height (e.g., 0.04 = 4%)
    fontSizePct?: number; // font size = width * fontSizePct
    fill?: string; // CSS color string
  }
): Promise<Buffer> {
  const text = opts?.text ?? "touchfeets.com";
  const opacity = Math.min(1, Math.max(0, opts?.opacity ?? 0.55));
  const marginPct = opts?.marginPct ?? 0.05;
  const fontSizePct = opts?.fontSizePct ?? 0.045;
  const fill = opts?.fill ?? "#ffffff";

  // Keep options simple and broadly compatible
  const base = Buffer.isBuffer(input) ? input : Buffer.from(input);
  const img = sharp(base);
  const meta = await img.metadata();
  const width = meta.width ?? 1024;
  const height = meta.height ?? 1024;

  const fontSize = Math.max(16, Math.round(width * fontSizePct));
  const yMargin = Math.max(8, Math.round(height * marginPct));

  // SVG with centered text and soft glow for legibility on dark/detailed backgrounds
  const svg = `
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="glow">
      <feGaussianBlur stdDeviation="${Math.max(0.6, fontSize * 0.07)}" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  <g opacity="${opacity}">
    <text x="${width / 2}" y="${height - yMargin}" text-anchor="middle"
          font-family="Inter, system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif"
          font-size="${fontSize}" fill="${fill}" filter="url(#glow)">${escapeXml(text)}</text>
  </g>
</svg>`.trim();

  // Try to preserve original output format, default to PNG
  const format = (meta.format ?? "png").toLowerCase();

  const composited = await img
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    // Typing of toFormat varies by version; cast for simplicity
    .toFormat(format as "png" | "webp" | "jpeg" | "jpg")
    .toBuffer();

  return composited;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}