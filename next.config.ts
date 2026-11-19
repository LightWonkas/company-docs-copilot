import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components: nothing is cached unless opted in with 'use cache'.
  // Project rule: never opt in for user-scoped data (see CLAUDE.md).
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
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
