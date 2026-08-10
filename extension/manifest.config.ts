import { defineManifest } from "@crxjs/vite-plugin";
import { SUPPORTED_MATCHES } from "./src/shared/sites";

export default defineManifest({
  manifest_version: 3,
  name: "HackSight AI",
  version: "0.1.0",
  description: "Private, local screenshot review before you share.",
  minimum_chrome_version: "109",
  permissions: ["storage", "scripting", "activeTab"],
  host_permissions: SUPPORTED_MATCHES,
  // A specific origin is requested only after the user adds a custom site or
  // explicitly enables the optional OpenRouter scan. Nothing is granted at
  // install time beyond the five supported destinations above.
  optional_host_permissions: ["https://*/*", "http://*/*"],
  background: { service_worker: "src/background/index.ts", type: "module" },
  action: {
    default_title: "HackSight AI",
    default_popup: "src/popup/index.html",
    default_icon: { 16: "icons/icon-16.png", 32: "icons/icon-32.png", 48: "icons/icon-48.png", 128: "icons/icon-128.png" },
  },
  icons: { 16: "icons/icon-16.png", 32: "icons/icon-32.png", 48: "icons/icon-48.png", 128: "icons/icon-128.png" },
  options_page: "src/options/index.html",
  content_scripts: [
    {
      matches: SUPPORTED_MATCHES,
      js: ["src/content/index.ts"],
      run_at: "document_start",
    },
  ],
  // These are fetched by workers launched from the isolated content script.
  // They do not grant page access or host permissions; the broad match is
  // necessary solely so a user-approved custom domain can load the same
  // packaged local model after chrome.scripting registers the content script.
  web_accessible_resources: [
    {
      // `worker.min.js` is intentionally listed explicitly. Chrome creates
      // this worker in the page-associated content-script context; some
      // Chromium builds do not apply a directory wildcard consistently to a
      // Worker() script URL, even though they do for fetch()/importScripts().
      // Keeping the worker explicit avoids a silent OCR failure on Reddit.
      resources: [
        "tesseract/worker.min.js",
        "tesseract-core/*",
        "tessdata/eng.traineddata.gz",
        "models/*",
        "wasm/*",
        "assets/*.js",
      ],
      matches: ["https://*/*", "http://*/*"],
    },
  ],
  content_security_policy: {
    extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; connect-src 'self' https://openrouter.ai",
  },
});
