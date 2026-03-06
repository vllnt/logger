import baseConfig from "@vllnt/eslint-config/nodejs";
import tsparser from "@typescript-eslint/parser";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default [
  {
    ignores: ["node_modules/**", "dist/**", "eslint.config.js", "*.config.*"],
  },
  ...baseConfig,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: resolve(__dirname, "./tsconfig.json"),
        tsconfigRootDir: __dirname,
      },
    },
  },
];
