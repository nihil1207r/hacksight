/**
 * Captures real demo screenshots of the running app for the README / demo
 * deck. Not run as part of `npm run build` — it needs a browser (Playwright)
 * and, for the analysis screen, a real GEMINI_API_KEY, so it's opt-in.
 *
 * Usage:
 *   npm install --save-dev playwright
 *   npx playwright install chromium
 *   npm run screenshots                       # landing page only
 *   npm run screenshots -- path/to/sample.png  # + analysis screen, using that image
 */
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "docs", "screenshots");
const port = 3100;
const url = `http://localhost:${port}`;
const sampleImage = process.argv[2];

async function waitForServer(target, timeoutMs = 60_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(target);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Dev server didn't respond at ${target} within ${timeoutMs}ms`);
}

async function main() {
  let playwright;
  try {
    playwright = await import("playwright");
  } catch {
    console.error(
      "\nPlaywright isn't installed. Run:\n  npm install --save-dev playwright\n  npx playwright install chromium\n"
    );
    process.exit(1);
  }

  await mkdir(outDir, { recursive: true });

  console.log(`Starting dev server on :${port}…`);
  const server = spawn("npx", ["next", "dev", "-p", String(port)], {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  const cleanup = () => server.kill("SIGTERM");
  process.on("exit", cleanup);
  process.on("SIGINT", () => {
    cleanup();
    process.exit(1);
  });

  try {
    await waitForServer(url);

    const browser = await playwright.chromium.launch();

    // Desktop landing
    const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const desktopPage = await desktop.newPage();
    await desktopPage.goto(url, { waitUntil: "networkidle" });
    await desktopPage.waitForTimeout(500); // let entrance animations settle
    await desktopPage.screenshot({ path: path.join(outDir, "landing-desktop.png") });
    console.log("Saved landing-desktop.png");

    // Mobile landing
    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const mobilePage = await mobile.newPage();
    await mobilePage.goto(url, { waitUntil: "networkidle" });
    await mobilePage.waitForTimeout(500);
    await mobilePage.screenshot({ path: path.join(outDir, "landing-mobile.png") });
    console.log("Saved landing-mobile.png");

    if (sampleImage) {
      console.log(`Uploading ${sampleImage} to capture the analysis screen…`);
      const input = await desktopPage.$('input[type="file"]');
      if (input) {
        await input.setInputFiles(path.resolve(sampleImage));
        // OCR + (optionally) Gemini simulation take a few seconds — this is a
        // generous fixed wait rather than a flaky selector race.
        await desktopPage.waitForTimeout(15_000);
        await desktopPage.screenshot({ path: path.join(outDir, "analysis-desktop.png"), fullPage: true });
        console.log("Saved analysis-desktop.png");
      } else {
        console.warn("Could not find the file input — skipping analysis screenshot.");
      }
    } else {
      console.log("\nTip: pass a sample screenshot path to also capture the analysis screen:");
      console.log("  npm run screenshots -- ./sample.png\n");
    }

    await browser.close();
  } finally {
    cleanup();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
