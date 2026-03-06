import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    convex: "src/convex.ts",
    posthog: "src/posthog.ts",
    testing: "src/testing.ts",
  },
  format: ["esm"],
  dts: true,
  clean: true,
  splitting: true,
});
