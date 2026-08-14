import type { SemanticFinding, SemanticCategory } from "./semanticScan";
import type { OcrLine } from "./detectSecrets";

export interface LocalScanProgress {
  status: string;
  /** 0..1, best-effort — only meaningful while the model is downloading. */
  progress: number;
}

/** Packaged paths used by the extension to keep NER model and WASM code
 * local. The normal web app behavior remains unchanged when not configured. */
export interface LocalSemanticAssets {
  modelPath: string;
  wasmPath: string;
}

let localSemanticAssets: LocalSemanticAssets | null = null;

export function configureLocalSemanticAssets(assets: LocalSemanticAssets | null): void {
  localSemanticAssets = assets;
}

interface NerEntity {
  entity_group: string;
  word: string;
  score: number;
}

type NerPipeline = (text: string | string[], options?: Record<string, unknown>) => Promise<NerEntity[] | NerEntity[][]>;

// Small (~40MB quantized) general-purpose NER model. Good enough to catch
// obvious person/org/location mentions; not a substitute for a human, but
// unlike the cloud pass, the OCR text never leaves the browser to get this
// coverage — every model weight fetch and every inference call happens
// on-device.
const MODEL_ID = "Xenova/bert-base-NER";

const ENTITY_MAP: Partial<Record<string, SemanticCategory>> = {
  PER: "person_name",
  ORG: "employer_or_workplace",
  LOC: "other_sensitive",
};

// Same pattern as ocr.ts's worker cache: loading the model (fetch + parse +
// compile the ONNX graph) is the expensive part, not running it — keep one
// pipeline alive for the tab's lifetime so only the first scan pays for it.
let pipelinePromise: Promise<NerPipeline> | null = null;
// Model loading is a single shared resource — if several images are being
// scanned concurrently and this is the first load in the session, every one
// of them is genuinely waiting on the exact same load, so all of their
// progress callbacks should see it. A single shared variable here (as this
// used to be) meant the load's progress calls quietly redirected entirely
// to whichever call started most recently, and any others simply stopped
// hearing progress until they, coincidentally, became the "current" one.
const progressListeners = new Set<(p: LocalScanProgress) => void>();

async function getPipeline(): Promise<NerPipeline> {
  if (!pipelinePromise) {
    pipelinePromise = (async () => {
      const { pipeline, env } = await import("@xenova/transformers");
      if (localSemanticAssets) {
        // The extension packages the model and ONNX WASM runtime locally
        // instead of fetching from the public model CDN, so scanning works
        // fully offline and never depends on a remote host being reachable
        // from a content script.
        env.allowRemoteModels = false;
        env.allowLocalModels = true;
        env.localModelPath = localSemanticAssets.modelPath;
        env.backends.onnx.wasm.wasmPaths = localSemanticAssets.wasmPath;
      } else {
        // Web app: never fall back to a server-provided model directory —
        // the model must come from the public model CDN (and browser Cache
        // Storage on every run after the first) or not run at all.
        env.allowLocalModels = false;
      }

      const pipe = await pipeline("token-classification", MODEL_ID, {
        progress_callback: (p: { status: string; progress?: number }) => {
          const mapped: LocalScanProgress = { status: p.status, progress: p.progress ? p.progress / 100 : 0 };
          progressListeners.forEach((listener) => listener(mapped));
        },
      });
      return pipe as unknown as NerPipeline;
    })().catch((err) => {
      pipelinePromise = null; // don't cache a failed load — let the next scan retry
      throw err;
    });
  }
  return pipelinePromise;
}

/** Lets the UI show "on-device scan — private" unconditionally, since this
 * never depends on a server API key the way the cloud pass does. */
export function isLocalSemanticScanSupported(): boolean {
  return typeof window !== "undefined" && typeof WebAssembly !== "undefined";
}

/**
 * Kicks off model download + WASM compile without waiting for OCR text.
 * The model fetch/compile has no dependency on the screenshot at all, so
 * callers that already know Deep Scan is enabled can call this the moment
 * a file is selected — by the time OCR finishes and there's actual text to
 * run inference on, the model is already warm instead of paying its
 * cold-start cost serially after OCR. Safe to call multiple times (getPipeline
 * caches the in-flight/resolved promise); errors are swallowed here since
 * runLocalSemanticScan will surface and handle the real failure when it
 * actually needs the pipeline.
 */
export function preloadLocalSemanticModel(): void {
  getPipeline().catch(() => {
    // Ignore here — runLocalSemanticScan will retry and surface the error
    // through its normal try/catch when it's actually called.
  });
}

/**
 * Runs the on-device NER pass over OCR'd lines. Mirrors runSemanticScan's
 * output shape (SemanticFinding[]) so callers can merge/render both passes
 * identically via buildFindingsFromSemantic. Never throws for per-line
 * inference failures — a bad line is skipped, not fatal to the whole scan.
 */
export async function runLocalSemanticScan(lines: OcrLine[], onProgress?: (p: LocalScanProgress) => void): Promise<SemanticFinding[]> {
  const hasText = lines.some((l) => l.text.trim().length > 0);
  if (!hasText) return [];

  if (onProgress) progressListeners.add(onProgress);
  let ner: NerPipeline;
  try {
    ner = await getPipeline();
  } catch (err) {
    if (onProgress) progressListeners.delete(onProgress);
    throw err instanceof Error ? err : new Error("Could not load the on-device model.");
  }

  // Batch inference: transformers.js pipelines accept an array of strings
  // and run them through the model together instead of one WASM call per
  // line. Previously this looped `await ner(text)` per line, which meant a
  // 50-line screenshot paid 50 separate inference round-trips. Non-empty
  // lines are tracked alongside their original lineIndex so results still
  // map back correctly; empty lines are skipped from the batch entirely
  // since the model has nothing to do with them.
  const nonEmptyIndices: number[] = [];
  const nonEmptyTexts: string[] = [];
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const text = lines[lineIndex].text;
    if (text.trim()) {
      nonEmptyIndices.push(lineIndex);
      nonEmptyTexts.push(text);
    }
  }

  const findings: SemanticFinding[] = [];
  if (nonEmptyTexts.length > 0) {
    let batchResults: NerEntity[] | NerEntity[][];
    try {
      batchResults = await ner(nonEmptyTexts, { aggregation_strategy: "simple" });
    } catch {
      // Batched call failed outright (e.g. a single malformed line poisoning
      // the whole batch) — fall back to the old one-at-a-time behavior so a
      // batch failure doesn't zero out the whole scan.
      //
      // Pushed into its own concretely-typed array rather than
      // `batchResults` directly: `batchResults`'s declared type is
      // `NerEntity[] | NerEntity[][]` (a union of two array shapes), and
      // TypeScript can't resolve a usable `.push()` parameter type across
      // that union — it collapses to `never`, so `batchResults.push(...)`
      // doesn't typecheck no matter what's pushed. Building a properly
      // typed `NerEntity[][]` here and assigning it to `batchResults` once,
      // after the loop, sidesteps that entirely.
      const fallbackResults: NerEntity[][] = [];
      for (const text of nonEmptyTexts) {
        try {
          fallbackResults.push(await ner(text, { aggregation_strategy: "simple" }) as NerEntity[]);
        } catch {
          fallbackResults.push([]);
        }
      }
      batchResults = fallbackResults;
    }

    for (let i = 0; i < nonEmptyIndices.length; i++) {
      const lineIndex = nonEmptyIndices[i];
      const text = nonEmptyTexts[i];
      // With a single input the pipeline returns a flat NerEntity[]; with an
      // array input it returns NerEntity[][], one per input. Normalize both.
      const entities: NerEntity[] = Array.isArray(batchResults[i]) ? (batchResults[i] as NerEntity[]) : (batchResults as unknown as NerEntity[]);

      for (const e of entities) {
        const category = ENTITY_MAP[e.entity_group];
        if (!category) continue; // MISC and anything unmapped: too noisy to flag

        const word = e.word.trim();
        // Require a real, confident, locatable match — mirrors the cloud
        // pass's "must appear verbatim in the input" rule so a subword
        // boundary artifact can't produce an unlocatable finding downstream.
        if (word.length < 2 || e.score < 0.6 || !text.includes(word)) continue;

        findings.push({
          text: word,
          category,
          reason:
            category === "person_name"
              ? "On-device model flagged this as a person's name."
              : category === "employer_or_workplace"
              ? "On-device model flagged this as an organization name."
              : "On-device model flagged this as a location mention.",
          lineIndex,
        });
      }
    }
  }

  if (onProgress) progressListeners.delete(onProgress);
  return findings;
}

/** Optional cleanup, mirroring disposeOcrWorker — not required since the
 * browser reclaims memory on tab close, but exposed for callers that want
 * to free it explicitly. */
export function disposeLocalSemanticModel(): void {
  pipelinePromise = null;
}