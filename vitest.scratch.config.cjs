// Config temporária de execução em sandbox (sem plugins nativos como @tailwindcss/vite).
// CJS de propósito: o vite carrega config CJS sem gravar arquivo temporário.
const path = require("node:path");
module.exports = {
  cacheDir: path.resolve(__dirname, ".scratch-vitest-cache"),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    cache: false,
    fsModuleCache: false,
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
};
