import { defineConfig } from "vitest/config";
import { resolve } from "path";

// Config mínimo só para rodar testes em sandbox sem os plugins do app.
export default defineConfig({
  resolve: {
    alias: { "@": resolve("src") },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
  },
});
