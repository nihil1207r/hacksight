import { createWorker, Worker } from "tesseract.js";
import type { OcrLine } from "./detectSecrets";

export interface OcrProgress {
  status: string;
  progress: number; // 0..1
}

export interface OcrOutput {
  lines: OcrLine[];
  imageWidth: number;
  imageHeight: number;
}

/** Packaged OCR assets used by the MV3 build. When absent, the web app keeps
 * Tesseract's regular browser defaults. */
export interface LocalOcrAssets {
  workerPath: string;
  corePath: string;
  langPath: string;
}

let localOcrAssets: LocalOcrAssets | null = null;

export function configureLocalOcrAssets(assets: LocalOcrAssets | null): void {
  localOcrAssets = assets;
}

/**
 * Performance: creating a Tesseract worker (loading the wasm core + language
 * data) is the expensive part of OCR, not the recognition pass itself. We
 * keep one worker alive for the lifetime of the tab and reuse it across
 * every "scan another screenshot" — only the very first scan pays the
 * cold-start cost.
 */
let workerPromise: Promise<Worker> | null = null;
let currentOnProgress: ((p: OcrProgress) => void) | undefined;

// Worker creation fetches the Tesseract wasm core + language data from a CDN
// by default. On a network that blocks that (corporate proxy, offline,
// restrictive sandbox), the fetch just hangs with no error — the UI looked
// "stuck on upload" with nothing telling the user why. This timeout turns
// that silent hang into a real, visible error.
const WORKER_INIT_TIMEOUT_MS = 20_000;

function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    let gaveUpWaiting = false;
    const creation = createWorker("eng", 1, {
      ...(localOcrAssets ?? {}),
      // A content script cannot directly create a Worker from a
      // chrome-extension:// URL on every supported host. Tesseract's small
      // local Blob wrapper imports that packaged worker instead, which keeps
      // all OCR code local while avoiding the host-origin restriction.
      ...(localOcrAssets ? { workerBlobURL: true } : {}),
      logger: (m) => {
        if (currentOnProgress) currentOnProgress({ status: m.status, progress: m.progress ?? 0 });
      },
    });

    workerPromise = Promise.race([
      creation,
      new Promise<Worker>((_, reject) =>
        setTimeout(() => {
          gaveUpWaiting = true;
          reject(
            new Error(
              localOcrAssets
                ? "The packaged OCR engine took too long to load. Check available memory and retry."
                : "OCR engine took too long to load. This usually means the Tesseract.js CDN (jsdelivr/unpkg) is blocked on this network — check your connection or firewall and try again."
            )
          );
        }, WORKER_INIT_TIMEOUT_MS)
      ),
    ]).catch((err) => {
      // Don't cache a failed attempt — let the next scan retry from scratch.
      workerPromise = null;
      throw err;
    });

    // `creation` itself is never cancelled by the race above — if it was
    // just slow rather than truly hung, it will still resolve on its own
    // some time after we already gave up on it and reset workerPromise.
    // Left alone, that worker keeps running with nothing referencing it —
    // a genuine leaked background thread. Shut it down instead of letting
    // it linger.
    void creation.then(
      (w) => {
        if (gaveUpWaiting) void w.terminate().catch(() => undefined);
      },
      () => undefined // creation's own rejection is already surfaced via the race above
    );
  }
  return workerPromise;
}

/**
 * Screenshots of dark-themed code editors — white/colored anti-aliased
 * monospace text on a near-black background — are close to worst-case input
 * for Tesseract, which is tuned for scanned black-on-white documents. In
 * testing, this is exactly what let real secrets slip through undetected:
 * OCR confidence on the lines carrying secret values dropped as low as ~5%,
 * with characters inside the value silently swapped or dropped, while short
 * high-contrast strings like a bare "https://..." URL survived fine —
 * producing the inverted, backwards-looking result of URLs getting flagged
 * but adjacent API keys and secrets not.
 *
 * Grayscale -> contrast-stretch -> 2x upscale measurably improves both
 * recognition accuracy and per-word confidence on this kind of screenshot
 * (verified against real dark-theme editor screenshots). It runs entirely
 * on a client-side canvas, so the "image never leaves the browser" privacy
 * guarantee is untouched.
 */
const OCR_UPSCALE = 2;

// The contrast-stretch pass below is a manual, synchronous per-pixel loop —
// it runs on the same thread the page renders on, so its cost has to be
// bounded regardless of how large the source screenshot is. Capping the
// working resolution before that loop (rather than after) keeps a huge
// screenshot from turning into tens of millions of pixels processed
// synchronously, which is enough to visibly freeze the page.
const MAX_OCR_WORKING_DIMENSION = 2200;

function preprocessForOcr(bitmap: ImageBitmap): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width * OCR_UPSCALE;
  canvas.height = bitmap.height * OCR_UPSCALE;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas is not supported in this browser.");

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = imgData;
  const pixelCount = data.length / 4;
  const gray = new Uint8ClampedArray(pixelCount);

  let min = 255;
  let max = 0;
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    gray[p] = g;
    if (g < min) min = g;
    if (g > max) max = g;
  }

  // Stretch whatever luminance range is actually present in this screenshot
  // out to the full 0-255 range, so faint anti-aliased text edges become
  // sharp, unambiguous black/white transitions instead of soft mid-grays.
  const range = Math.max(1, max - min);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const stretched = ((gray[p] - min) / range) * 255;
    data[i] = data[i + 1] = data[i + 2] = stretched;
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

/**
 * Runs OCR entirely in the browser via a local Tesseract.js worker.
 * The image never leaves the client — this is the privacy boundary the
 * whole product is built around.
 */
export async function runLocalOcr(
  file: File,
  onProgress?: (p: OcrProgress) => void
): Promise<OcrOutput> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap; // original dimensions — bboxes must map back to these, not the upscaled canvas

  // Downscale before the expensive preprocessing pass if this is an
  // unusually large screenshot. createImageBitmap's resize is handled by
  // the browser (fast, off the JS thread) — unlike the manual pixel loop
  // in preprocessForOcr, which is exactly what needs bounding here.
  const longestSide = Math.max(width, height);
  const workingScale = longestSide > MAX_OCR_WORKING_DIMENSION ? MAX_OCR_WORKING_DIMENSION / longestSide : 1;
  const workingBitmap =
    workingScale === 1
      ? bitmap
      : await createImageBitmap(bitmap, {
          resizeWidth: Math.round(width * workingScale),
          resizeHeight: Math.round(height * workingScale),
          resizeQuality: "high",
        });

  const preprocessed = preprocessForOcr(workingBitmap);
  // Both bitmaps are now baked into the preprocessed canvas — free their
  // decoded pixel buffers immediately rather than waiting on GC, which
  // matters when several images get scanned back to back in one session.
  if (workingBitmap !== bitmap) workingBitmap.close();
  bitmap.close();

  const worker = await getWorker();
  currentOnProgress = onProgress;

  // All bbox coordinates come back in the upscaled *working* canvas's
  // coordinate space. Undo both scale steps — the OCR upscale, then the
  // working-resolution downscale, if any — so they land correctly on the
  // true original image that redact.ts actually pixelates.
  const s = (v: number) => v / OCR_UPSCALE / workingScale;
  const scaleBBox = (b: { x0: number; y0: number; x1: number; y1: number }) => ({
    x0: s(b.x0),
    y0: s(b.y0),
    x1: s(b.x1),
    y1: s(b.y1),
  });

  try {
    const { data } = await worker.recognize(preprocessed, {}, { blocks: true });

    const lines: OcrLine[] = (data.blocks ?? []).flatMap((block) =>
      block.paragraphs.flatMap((paragraph) =>
        paragraph.lines.map((line) => ({
          text: line.text,
          words: line.words.map((w) => ({
            text: w.text,
            bbox: scaleBBox(w.bbox),
            // Character-level boxes, when Tesseract provides them — lets
            // redaction cover just a matched substring (e.g. the value in
            // "KEY=value") instead of the whole space-free word.
            symbols: w.symbols?.map((sym) => ({
              text: sym.text,
              bbox: scaleBBox(sym.bbox),
            })),
          })),
        }))
      )
    );

    return { lines, imageWidth: width, imageHeight: height };
  } catch (err) {
    // A worker that just failed a recognition pass is not necessarily safe
    // to reuse — don't let a future scan silently retry against one that
    // may already be in a bad state. Worth the cost of recreating it once.
    workerPromise = null;
    throw err;
  } finally {
    currentOnProgress = undefined;
  }
}

/** Optional cleanup — not required (the browser reclaims the worker when the
 * tab closes), but exposed for callers that want to free memory explicitly. */
export async function disposeOcrWorker(): Promise<void> {
  if (workerPromise) {
    const w = await workerPromise;
    await w.terminate();
    workerPromise = null;
  }
}