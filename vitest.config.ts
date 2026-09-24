import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    clearMocks: true,
    include: [
      "src/**/*.test.{ts,tsx}",
      "api/**/*.test.ts",
      "tests/**/*.test.ts",
    ],
  },
})
