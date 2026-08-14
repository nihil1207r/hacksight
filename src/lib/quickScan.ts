import { runLocalOcr } from "./ocr";
import { runLocalSemanticScan, preloadLocalSemanticModel } from "./localSemanticScan";
import { detectSecrets, scoreFindings, buildFindingsFromSemantic, type DetectionResult } from "./detectSecrets";

export interface QuickScanResult {
  file: File;
  detection: DetectionResult;
  imageWidth: number;
  imageHeight: number;
}

/**
 * The same scan pipeline AnalysisScreen's "scanning_screenshot" phase runs
 * (OCR, then regex detection, then — if Deep Scan is on — the on-device and
 * optional cloud semantic passes run concurrently, since neither depends on
 * the other's output), factored out so a batch of images can all be scanned
 * up front without duplicating that logic or risking drift between the two:
 * a batch result card's score always matches what opening that image's full
 * report would show, because it's the exact same computation.
 */
export async function quickScan(file: File, deepScan: boolean, cloudDeepScan: boolean): Promise<QuickScanResult> {
  if (deepScan) preloadLocalSemanticModel();
  const ocrOutput = await runLocalOcr(file);
  const regexDetection = detectSecrets(ocrOutput.lines);

  let detection: DetectionResult = regexDetection;
  if (deepScan) {
    const localPromise = runLocalSemanticScan(ocrOutput.lines);
    const cloudPromise = cloudDeepScan
      ? fetch("/api/semantic-scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lines: ocrOutput.lines.map((l) => l.text) }),
        }).then((res) => (res.ok ? res.json() : null))
      : Promise.resolve(null);

    const [localResult, cloudResult] = await Promise.allSettled([localPromise, cloudPromise]);
    const semanticFindings: ReturnType<typeof buildFindingsFromSemantic> = [];

    if (localResult.status === "fulfilled") {
      semanticFindings.push(...buildFindingsFromSemantic(ocrOutput.lines, localResult.value, regexDetection.findings.length));
    }
    if (cloudResult.status === "fulfilled" && cloudResult.value) {
      semanticFindings.push(
        ...buildFindingsFromSemantic(ocrOutput.lines, cloudResult.value.findings ?? [], regexDetection.findings.length + semanticFindings.length)
      );
    }
    if (semanticFindings.length > 0) {
      detection = scoreFindings([...regexDetection.findings, ...semanticFindings], regexDetection.documentEnvironment);
    }
  }

  return { file, detection, imageWidth: ocrOutput.imageWidth, imageHeight: ocrOutput.imageHeight };
}
