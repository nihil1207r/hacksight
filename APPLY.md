# Applying this to your existing app repo

Copy into your repo root (same level as `src/`, `package.json`):

```
extension/            → new folder, drop in as-is
src/lib/ocr.ts         → overwrite your existing file
src/lib/localSemanticScan.ts → overwrite your existing file
src/lib/redact.ts      → overwrite your existing file
.gitattributes         → new file at repo root (or merge if you already have one)
```

Those three `src/lib` files are the ones the extension actually depends on
(`extension/src/shared/pipeline.ts` imports them via the `@hacksight/lib`
alias, which points straight at `src/lib`). They're your existing files with
two things added back in:

- `configureLocalOcrAssets` / `configureLocalSemanticAssets` — lets the
  extension point OCR/NER at its own packaged files instead of a CDN, so it
  works fully offline. The web app is unaffected when these aren't called.
- A fix in `redact.ts`: it referenced `process.env.NODE_ENV`, which doesn't
  exist in the extension's browser-only content script and would throw.

## 2. `package.json` — add these by hand

Scripts:
```json
"extension:dev": "vite --config extension/vite.config.ts",
"extension:build": "vite build --config extension/vite.config.ts",
"extension:typecheck": "tsc --project extension/tsconfig.json --noEmit"
```

devDependencies:
```json
"@crxjs/vite-plugin": "^2.7.0",
"@types/chrome": "^0.0.282",
"@vitejs/plugin-react": "^4.3.4",
"vite": "^6.0.0"
```

Then `npm install`.

## 3. `.gitignore` — add

```
/extension/dist
/extension/unpacked
/extension/*.zip
```

## 4. Git LFS for the packaged model/WASM files

`extension/public/models/Xenova/bert-base-NER/onnx/model_quantized.onnx` is
~104MB — over GitHub's 100MB per-file limit for a normal push. The
`.gitattributes` you copied in already routes it (and the other large WASM
runtimes) through Git LFS. Before your first commit of these files:

```bash
git lfs install
git add .gitattributes
git add extension/
git add src/lib/ocr.ts src/lib/localSemanticScan.ts src/lib/redact.ts
git commit -m "Add HackSight browser extension"
git push
```

If you don't have Git LFS yet: `brew install git-lfs` (macOS),
`apt install git-lfs` (Debian/Ubuntu), or winget on Windows, then
`git lfs install` once per machine.

## 5. Build and load it

```bash
npm run extension:build
```

Open `chrome://extensions`, enable Developer mode, "Load unpacked", pick
`extension/unpacked`.

## What's new versus a plain port

- **"Protect me everywhere"** — an opt-in toggle on the extension's Settings
  page. It requests Chrome's broad host permission once, then the same
  scan → popup → continue/redact/cancel flow runs on any http(s) site, not
  just the five built-in ones (GitHub, Reddit, Discord, Stack Overflow,
  LinkedIn). Implemented in `extension/src/shared/types.ts`,
  `extension/src/background/index.ts`, `extension/src/content/index.ts`,
  and `extension/src/options/main.tsx`.
