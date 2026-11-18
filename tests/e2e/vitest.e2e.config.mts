import { resolve } from "node:path";
import { defineConfig, mergeConfig } from "vitest/config";
import baseConfig from "../../vitest.min.config.mts";

const siteRoot = resolve(import.meta.dirname, "../..");

export default mergeConfig(
  baseConfig,
  defineConfig({
    root: siteRoot,
    resolve: {
      alias: {
        "@": resolve(siteRoot, "src"),
      },
    },
    test: {
      include: ["tests/e2e/**/*.e2e.{ts,tsx}"],
      exclude: ["node_modules/**", "dist/**"],
      testTimeout: 15_000,
      hookTimeout: 15_000,
      server: {
        deps: {
          inline: ["@nats-io/nats-core"],
        },
      },
    },
  }),
);
