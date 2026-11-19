import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components: nothing is cached unless opted in with 'use cache'.
  // Project rule: never opt in for user-scoped data (see CLAUDE.md).
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  // Native ONNX runtime + model files: load from node_modules at runtime
  // instead of bundling (once per process, see lib/embeddings). The Anthropic
  // SDK and Bolt use dynamic imports Turbopack can't trace in route handlers.
  serverExternalPackages: ["@huggingface/transformers", "onnxruntime-node", "@anthropic-ai/sdk", "@slack/bolt"],
  // Vercel functions are Linux x64 with a size cap: keep only the ONNX binary
  // that can run there, and drop browser/image backends transformers.js pulls in.
  outputFileTracingExcludes: {
    "/**": [
      "./node_modules/**/onnxruntime-node/bin/*/darwin/**",
      "./node_modules/**/onnxruntime-node/bin/*/win32/**",
      "./node_modules/**/onnxruntime-node/bin/*/linux/arm64/**",
      "./node_modules/**/onnxruntime-web/**",
      "./node_modules/**/@img/**",
      "./.cache/**",
    ],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
