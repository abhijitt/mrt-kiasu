import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  // Next's PostCSS config isn't a valid plugin for Vite's own pipeline, and
  // these are pure logic tests, so skip CSS processing entirely.
  css: { postcss: { plugins: [] } },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
