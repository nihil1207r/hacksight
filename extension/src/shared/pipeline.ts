import {
  buildFindingsFromSemantic,
  detectSecrets,
  scoreFindings,
  type DetectionResult,
} from "@hacksight/lib/detectSecrets";
import { configureLocalSemanticAssets, runLocalSemanticScan } from "@hacksight/lib/localSemanticScan";
import { configureLocalOcrAssets, runLocalOcr } from "@hacksight/lib/ocr";
import { generateSafeImage } from "@hacksight/lib/redact";
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

export async function scanLocally(request: LocalScanRequest): Promise<ExtensionScanResult> {
  configureBundledAssets();
  request.onProgress?.("Reading text locally");
  const ocr = await runLocalOcr(request.file, (progress) => request.onProgress?.(progress.status));
  let result: DetectionResult = detectSecrets(ocr.lines);
  let warning: string | undefined;

  if (request.settings.deepScan) {
    try {
      request.onProgress?.("Running Deep Scan on-device");
      const semantic = await runLocalSemanticScan(ocr.lines, (progress) => request.onProgress?.(progress.status));
      const semanticFindings = buildFindingsFromSemantic(ocr.lines, semantic, result.findings.length);
      result = scoreFindings([...result.findings, ...semanticFindings], result.documentEnvironment);
    } catch (error) {
      warning = error instanceof Error ? `Deep Scan was unavailable: ${error.message}` : "Deep Scan was unavailable.";
    }
  }

  if (request.settings.deepScan && request.settings.cloudSemanticScan && request.settings.openRouterApiKey.trim()) {
    try {
      request.onProgress?.("Running optional cloud semantic scan");
      const semantic = await runCloudSemanticScan(ocr.lines.map((line) => line.text), request.settings.openRouterApiKey);
      const semanticFindings = buildFindingsFromSemantic(ocr.lines, semantic, result.findings.length);
      result = scoreFindings([...result.findings, ...semanticFindings], result.documentEnvironment);
    } catch (error) {
      const cloudWarning = error instanceof Error ? error.message : "Cloud semantic scan was unavailable.";
      warning = warning ? `${warning} ${cloudWarning}` : cloudWarning;
    }
  }

  return { result, summary: makeSummary(result, request.site, request.file.name), warning };
}

export { generateSafeImage };
