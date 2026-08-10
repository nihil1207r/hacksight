import { resolve } from "node:path";
import { crx } from "@crxjs/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import manifest from "./manifest.config";

export default defineConfig({
  root: __dirname,
  plugins: [react(), crx({ manifest })],
  resolve: {
    alias: {
      "@hacksight/lib": resolve(__dirname, "../src/lib"),
    },
  },
  server: {
    cors: { origin: [/^chrome-extension:\/\//] },
    fs: { allow: [resolve(__dirname, "..")] },
  },
  // The web app's Tailwind v4 PostCSS config is Next-specific. The extension
  // deliberately reuses its design tokens in a small standalone stylesheet,
  // so Vite does not need to load that PostCSS configuration.
  css: { postcss: { plugins: [] } },
  build: {
    // Keep the new CRXJS build separate from the pre-existing MVP's dist
    // folder in this workspace, which can remain locked by Chrome on Windows.
    outDir: "unpacked",
    emptyOutDir: true,
    target: "chrome109",
  },
});
