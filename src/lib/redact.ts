import type { Finding } from "./detectSecrets";

export interface SafeImageResult {
  dataUrl: string;
  blob: Blob;
  width: number;
  height: number;
  redactedCount: number;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not load the image for redaction."));
    };
    img.src = url;
  });
}

/**
 * Mosaic-style pixelation: downscale the region to a tiny canvas, then draw
 * it back up. This is a real, irreversible destructive edit to the pixel
 * data (unlike a CSS blur overlay), so the exported file has no residual
 * trace of the original pixels in that region.
 */
function pixelateRegion(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  if (w <= 0 || h <= 0) return;
  const block = Math.max(6, Math.round(Math.min(w, h) / 6));

  const tiny = document.createElement("canvas");
  tiny.width = Math.max(1, Math.round(w / block));
  tiny.height = Math.max(1, Math.round(h / block));
  const tctx = tiny.getContext("2d");
  if (!tctx) return;

  tctx.imageSmoothingEnabled = true;
  tctx.drawImage(ctx.canvas, x, y, w, h, 0, 0, tiny.width, tiny.height);

  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(tiny, 0, 0, tiny.width, tiny.height, x, y, w, h);
}

function drawRedactionBorder(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.5, Math.min(w, h) * 0.02);
  ctx.strokeRect(x, y, w, h);
  ctx.restore();
}

const PADDING = 3;
// Floor for a redaction box's on-screen size. Real secrets are never this
// small on a readable screenshot — if a computed bbox comes out narrower or
// shorter than this, it's a sign of an OCR/geometry edge case, not a
// genuinely tiny finding. Rather than silently rendering a near-invisible
// (or zero-size, skipped) box in that case, expand it to a floor size
// around its own center so every accepted finding is always visibly
// redacted. Under-redaction is the failure mode this tool exists to avoid.
const MIN_BOX_W = 24;
const MIN_BOX_H = 12;

export async function generateSafeImage(file: File, findings: Finding[]): Promise<SafeImageResult> {
  const img = await loadImage(file);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not supported in this browser.");

  ctx.drawImage(img, 0, 0);

  let skipped = 0;
  for (const f of findings) {
    const b = f.bbox;
    if (!Number.isFinite(b.x0) || !Number.isFinite(b.y0) || !Number.isFinite(b.x1) || !Number.isFinite(b.y1)) {
      skipped++;
      continue;
    }

    // Some patterns can theoretically report reversed coordinates depending
    // on how OCR spans got unioned; normalize rather than silently drop.
    const rawX0 = Math.min(b.x0, b.x1);
    const rawX1 = Math.max(b.x0, b.x1);
    const rawY0 = Math.min(b.y0, b.y1);
    const rawY1 = Math.max(b.y0, b.y1);

    const cx = (rawX0 + rawX1) / 2;
    const cy = (rawY0 + rawY1) / 2;
    const boxW = Math.max(rawX1 - rawX0, MIN_BOX_W);
    const boxH = Math.max(rawY1 - rawY0, MIN_BOX_H);

    const x = Math.max(0, cx - boxW / 2 - PADDING);
    const y = Math.max(0, cy - boxH / 2 - PADDING);
    const w = Math.min(canvas.width - x, boxW + PADDING * 2);
    const h = Math.min(canvas.height - y, boxH + PADDING * 2);

    pixelateRegion(ctx, x, y, w, h);
    drawRedactionBorder(ctx, x, y, w, h, f.severity >= 7 ? "#ff3b4e" : f.severity >= 4 ? "#ffb020" : "#33d992");
  }

  // Avoid relying on Next.js's process.env replacement: this module is also
  // bundled into the extension's browser-only content script, where
  // `process` is not defined and referencing it throws instead of warning.
  if (skipped > 0) {
    console.warn(`generateSafeImage: skipped ${skipped} finding(s) with non-finite bbox coordinates.`);
  }

  const dataUrl = canvas.toDataURL("image/png");
  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b) resolve(b);
      else reject(new Error("Could not export the redacted image."));
    }, "image/png");
  });

  return { dataUrl, blob, width: canvas.width, height: canvas.height, redactedCount: findings.length };
}