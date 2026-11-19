import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components: nothing is cached unless opted in with 'use cache'.
  // Project rule: never opt in for user-scoped data (see CLAUDE.md).
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  // Native ONNX runtime + model files: load from node_modules at runtime
  // instead of bundling (once per process, see lib/embeddings).
  serverExternalPackages: ["@huggingface/transformers", "onnxruntime-node"],
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
