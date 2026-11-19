import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Integration tests run against the seeded local Supabase stack.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["tests/integration/**/*.int.test.ts"],
    environment: "node",
    setupFiles: ["tests/integration/setup.ts"],
    testTimeout: 120_000,
    hookTimeout: 300_000,
    // One process: the embedding model is loaded once.
    fileParallelism: false,
  },
});
