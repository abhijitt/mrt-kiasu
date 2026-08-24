import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

/**
 * Flat config, consumed by the ESLint CLI directly.
 *
 * Next 16 removed the `next lint` command and `next build` no longer lints, so
 * linting is its own step in package.json and in CI. `eslint-config-next` now
 * ships native flat configs, which replaced the `FlatCompat` shim this file
 * used to need — the core-web-vitals entry already bundles `next` and
 * `next/typescript`.
 */
const eslintConfig = [
  {
    // `next lint` used to supply these; running the CLI directly does not, and
    // without them ESLint walks the build output.
    ignores: [".next/**", "out/**", "coverage/**", "next-env.d.ts"],
  },
  ...nextCoreWebVitals,
  {
    // Scoped to TS: the flat config registers `@typescript-eslint` only for
    // these files, so an unscoped override fails on the .mjs configs and
    // scripts, where the plugin is not defined.
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      // Underscore-prefixed arguments are deliberately unused — they exist to
      // give a mock or callback the right signature.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
];

export default eslintConfig;
