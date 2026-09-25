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
    // The servers run on UTC — Vercel's and CI's both — while a developer
    // here is usually on Singapore time, and code that must give Singapore's
    // answer regardless is exactly what that difference hides. A test that
    // assumed the machine was in Singapore passed locally for twelve days
    // while CI failed on it. Every run is UTC, so local and CI cannot differ.
    env: { TZ: "UTC" },
  },
});
