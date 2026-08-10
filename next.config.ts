import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces a self-contained server build (server + only the deps it
  // actually needs) — much smaller than the default output, and what the
  // Dockerfile below relies on for a lean deploy image.
  output: "standalone",

  // @xenova/transformers (on-device semantic scan) only ever runs in the
  // browser via WASM, but it optionally requires `sharp` and
  // `onnxruntime-node` for its unused Node code paths. Without this, the
  // webpack build fails trying to resolve those native packages even though
  // nothing in this app calls into them.
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      sharp$: false,
      "onnxruntime-node$": false,
    };
    return config;
  },

  // Security headers appropriate for a tool that handles screenshots that
  // may contain sensitive data, even though nothing is stored server-side.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
