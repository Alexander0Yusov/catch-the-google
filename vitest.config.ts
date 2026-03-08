import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    exclude: ["tests/e2e/**", "src/test/e2e/**", "dist/**"],
    environment: "node",
    fileParallelism: false,
    testTimeout: 10000,
  },
});
