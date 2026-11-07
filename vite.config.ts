import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Relative URLs also support user sites, project sites, and renamed repositories.
  base: "./",
  build: { target: "es2022" },
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
});
