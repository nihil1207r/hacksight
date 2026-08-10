/**
 * Scans one or more image files for leaked secrets/PII using the same
 * detection logic as the web app (lib/patterns.ts + lib/detectSecrets.ts),
 * run headlessly in Node via tesseract.js instead of the browser.
 *
 * Usage:
 *   npx tsx scripts/scan-images.ts path/to/screenshot.png [more images...]
 *
 * Exit code is non-zero if any scanned image scores "medium" or "critical" —
 * intended for CI (see .github/workflows/scan-pr-images.yml), which fails a
 * PR that attaches a screenshot containing a leaked key.
 */
import { createWorker } from "tesseract.js";
import { detectSecrets, OcrLine } from "../src/lib/detectSecrets";

const files = process.argv.slice(2);

if (files.length === 0) {
  console.error("Usage: tsx scripts/scan-images.ts <image> [image...]");
  process.exit(2);
}

async function ocrToLines(worker: Awaited<ReturnType<typeof createWorker>>, file: string): Promise<OcrLine[]> {
  const { data } = await worker.recognize(file, {}, { blocks: true });
  return (data.blocks ?? []).flatMap((block) =>
    block.paragraphs.flatMap((paragraph) =>
      paragraph.lines.map((line) => ({
        text: line.text,
        words: line.words.map((w) => ({
          text: w.text,
          bbox: w.bbox,
          symbols: w.symbols?.map((s) => ({ text: s.text, bbox: s.bbox })),
        })),
      }))
    )
  );
}

async function main() {
  const worker = await createWorker("eng");
  let worstBand: "low" | "medium" | "critical" = "low";

  try {
    for (const file of files) {
      const lines = await ocrToLines(worker, file);
      const result = detectSecrets(lines);

      console.log(`\n${file}`);
      if (result.findings.length === 0) {
        console.log("  no findings");
        continue;
      }
      for (const f of result.findings) {
        console.log(`  [severity ${f.severity}/10] ${f.label} — ${f.maskedValue} (${f.environment})`);
      }
      console.log(`  score: ${result.overallScore}/100 (${result.band})`);

      if (result.band === "critical" || (result.band === "medium" && worstBand === "low")) {
        worstBand = result.band;
      }
    }
  } finally {
    await worker.terminate();
  }

  if (worstBand !== "low") {
    console.error(`\n✗ scan found ${worstBand}-risk exposure — failing`);
    process.exit(1);
  }
  console.log("\n✓ no medium/critical findings");
}

// tesseract.js reports worker-init failures (e.g. no network access to fetch
// language data) as an emitted worker error rather than a rejected promise,
// so a plain .catch() on main() doesn't reliably catch it — handle both.
process.on("uncaughtException", (err) => {
  console.error("Scan failed:", err.message ?? err);
  process.exit(1);
});

main().catch((err) => {
  console.error("Scan failed:", err.message ?? err);
  process.exit(1);
});
