# HackSight AI Chrome extension

HackSight AI is a Manifest V3, local-first pre-share checkpoint for screenshots. It pauses a supported image upload, runs OCR and sensitive-data detection in the browser, and lets you continue, cancel, or replace the attachment with a pixelated PNG.

## Build and load unpacked

From the HackSight web-app root (`app/`):

```bash
npm install
npm run extension:typecheck
npm run extension:build
```

Open `chrome://extensions`, enable **Developer mode**, select **Load unpacked**, and choose `app/extension/unpacked`. Reload an already-open supported site after installation.

For development, run `npm run extension:dev` from `app/`. CRXJS serves a development build with extension-aware live reload. For a deterministic load-unpacked build, use `npm run extension:build` and reload the extension after each build.

## Supported upload flows

| Site | File picker | Drag and drop |
| --- | --- | --- |
| GitHub | Yes | Yes |
| Reddit | Yes | Yes |
| Discord web | Yes | Yes |
| Stack Overflow | Yes | Yes |
| LinkedIn | Yes | Yes |

The extension scans PNG, JPEG, and WebP images up to 10 MB. It deliberately skips GIF, SVG, HEIC, and other animated/unsupported formats. A custom site can be added in Settings; Chrome requests access only to that specific origin, and the page needs a reload after adding it. Alternatively, turn on **Protect me everywhere** in Settings to review uploads on any http(s) site — Chrome will prompt you to confirm the broader permission once, and you can revoke it from the same toggle (or from `chrome://extensions` → Site access) at any time.

## Packaging note: large bundled files

The offline NER model (`extension/public/models/Xenova/bert-base-NER/onnx/model_quantized.onnx`, ~104MB) and the ONNX/Tesseract WASM runtimes ship inside `extension/public` so scanning works fully offline. The model file alone is over GitHub's 100MB per-file limit for a normal push, so this repo tracks it (and the other large binaries) with [Git LFS](https://git-lfs.com) — see `.gitattributes` at the repo root. Run `git lfs install` once before your first `git add`/`git push` of these files.

## Shared versus extension-only code

The extension imports the web app's own local detection layer directly from `../src/lib`:

- `patterns.ts` — structured secret/PII patterns and severity bands
- `detectSecrets.ts` — OCR-word-to-bounding-box mapping and risk scoring
- `ocr.ts` — Tesseract preprocessing and OCR output
- `redact.ts` — irreversible canvas pixelation

`ocr.ts`, `localSemanticScan.ts`, and `redact.ts` have small shared compatibility additions: the extension supplies packaged worker/model paths and avoids a Next.js-only `process.env` reference. The Next.js app keeps its normal behavior when those extension asset paths are not configured.

Everything under `extension/src/` is extension-only: capture listeners, the shadow-DOM review dialog, replay logic, React popup/options pages, dynamic custom-site registration, storage, and toolbar state.

## Privacy and local model policy

By default, image pixels, OCR text, filenames, findings, and credential values stay in page memory. The only persisted scan data is the popup's minimal last-result summary (masked value, label, category, and severity); no image, OCR text, or raw secret is stored. Settings and an optional OpenRouter key are stored exclusively in `chrome.storage.local`, never sync.

Tesseract's worker, OCR core, English language data, ONNX Runtime WASM, and the `Xenova/bert-base-NER` quantized model all ship under `extension/public` and are copied into the extension package. The extension does not fetch OCR or NER code/model data at scan time, satisfying MV3 CSP and Chrome Web Store remote-code rules.

**Deep Scan** uses that bundled NER model on-device for person names, organizations, and location mentions. It has the same practical limitations as the web app: it can miss ambiguous information and can produce occasional false positives.

**Cloud Semantic Scan** is separately off by default. If you enable it and provide your own OpenRouter API key, HackSight sends OCR text—not the image—to OpenRouter for a second pass over unstructured information such as addresses, named family members, account identifiers, and plaintext security answers. This is a real privacy trade-off; leave it off for the full local-only guarantee. Chrome asks for OpenRouter access only when you enable the feature.

## Upload behavior

HackSight uses warn-and-pause, not irreversible blocking. It intercepts the browser event before the site receives the image, then replays the original file only after **Continue anyway**, or creates a new redacted PNG for **Use redacted version**. Native page upload implementations vary, especially for drag/drop; if replay is rejected by a site, download/attach the redacted file manually.
