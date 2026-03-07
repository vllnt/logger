import baseConfig from "@vllnt/eslint-config/nodejs";

export default [
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "eslint.config.js",
      "*.config.*",
      "tests/**",
    ],
  },
  ...baseConfig,
];
