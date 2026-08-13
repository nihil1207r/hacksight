import {
  buildFindingsFromSemantic,
  detectSecrets,
  scoreFindings,
  type DetectionResult,
} from "@hacksight/lib/detectSecrets";
import { configureLocalSemanticAssets, runLocalSemanticScan } from "@hacksight/lib/localSemanticScan";
import { configureLocalOcrAssets, runLocalOcr, type OcrOutput } from "@hacksight/lib/ocr";
import { generateSafeImage } from "@hacksight/lib/redact";
import type { SemanticFinding } from "@hacksight/lib/semanticScan";
import { runCloudSemanticScan } from "./cloudSemantic";
import { makeSummary, type LocalScanRequest, type ScanResponse } from "./types";

let configured = false;

function configureBundledAssets(): void {
  if (configured) return;
  configured = true;
  configureLocalOcrAssets({
    workerPath: chrome.runtime.getURL("tesseract/worker.min.js"),
    corePath: chrome.runtime.getURL("tesseract-core"),
    langPath: chrome.runtime.getURL("tessdata"),
  });
  configureLocalSemanticAssets({
    modelPath: chrome.runtime.getURL("models/"),
    wasmPath: chrome.runtime.getURL("wasm/"),
  });
}

export interface ExtensionScanResult extends ScanResponse {
  warning?: string;
}

async function runDeepScanIfEnabled(ocr: OcrOutput, request: LocalScanRequest): Promise<SemanticFinding[] | null> {
  if (!request.settings.deepScan) return null;
  request.onProgress?.("Running Deep Scan on-device");
  return runLocalSemanticScan(ocr.lines, (progress) => request.onProgress?.(progress.status));
}

async function runCloudScanIfEnabled(ocr: OcrOutput, request: LocalScanRequest): Promise<SemanticFinding[] | null> {
  if (!request.settings.deepScan || !request.settings.cloudSemanticScan || !request.settings.openRouterApiKey.trim()) return null;
  request.onProgress?.("Running optional cloud semantic scan");
  return runCloudSemanticScan(ocr.lines.map((line) => line.text), request.settings.openRouterApiKey);
}

export async function scanLocally(request: LocalScanRequest): Promise<ExtensionScanResult> {
  configureBundledAssets();
  request.onProgress?.("Reading text locally");
  const ocr = await runLocalOcr(request.file, (progress) => request.onProgress?.(progress.status));
  let result: DetectionResult = detectSecrets(ocr.lines);
  const warnings: string[] = [];

  if (request.settings.deepScan) {
    // On-device Deep Scan and the optional cloud scan are independent of
    // each other — both only need the OCR text, neither depends on the
    // other's output — so run them concurrently instead of back to back.
    // With both enabled this roughly halves total scan time versus paying
    // the full latency of each in sequence.
    const [localOutcome, cloudOutcome] = await Promise.allSettled([runDeepScanIfEnabled(ocr, request), runCloudScanIfEnabled(ocr, request)]);

    const combinedFindings = [...result.findings];
    if (localOutcome.status === "fulfilled" && localOutcome.value) {
      combinedFindings.push(...buildFindingsFromSemantic(ocr.lines, localOutcome.value, combinedFindings.length));
    } else if (localOutcome.status === "rejected") {
      const err = localOutcome.reason;
      warnings.push(err instanceof Error ? `Deep Scan was unavailable: ${err.message}` : "Deep Scan was unavailable.");
    }
    if (cloudOutcome.status === "fulfilled" && cloudOutcome.value) {
      combinedFindings.push(...buildFindingsFromSemantic(ocr.lines, cloudOutcome.value, combinedFindings.length));
    } else if (cloudOutcome.status === "rejected") {
      const err = cloudOutcome.reason;
      warnings.push(err instanceof Error ? err.message : "Cloud semantic scan was unavailable.");
    }
    result = scoreFindings(combinedFindings, result.documentEnvironment);
  }

  return { result, summary: makeSummary(result, request.site, request.file.name), warning: warnings.length > 0 ? warnings.join(" ") : undefined };
}

export { generateSafeImage };