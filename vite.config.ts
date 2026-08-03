import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { resolve } from "path";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      workbox: {
        // API/docs/realtime routes must bypass SPA navigation fallback.
        navigateFallbackDenylist: [
          /^\/api\//,
          /^\/hubs\//,
          /^\/nats\//,
          /^\/openapi(?:\/|$)/,
          /^\/scalar(?:\/|$)/,
        ],
      },
      manifest: {
        name: "Discovery RMM",
        short_name: "Discovery",
        description: "Remote Monitoring & Management",
        theme_color: "#6366f1",
        background_color: "#0f172a",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:5288",
        changeOrigin: true,
      },
      "/hubs": {
        target: "http://localhost:5288",
        changeOrigin: true,
        ws: true,
      },
      "/openapi": {
        target: "http://localhost:5288",
        changeOrigin: true,
      },
      "/scalar": {
        target: "http://localhost:5288",
        changeOrigin: true,
      },
    },
  },
  build: {
    target: "es2022",
    rolldownOptions: {
      output: {
        // Rolldown-native chunking (substitui o manualChunks legado do Rollup).
        // Cada grupo usa `test` (regex sobre o caminho do módulo) e `priority`.
        advancedChunks: {
          groups: [
            {
              name: "vendor",
              test: /node_modules[\\/](react|react-dom|react-router-dom|scheduler|react-is)[\\/]/,
              priority: 60,
            },
            {
              name: "editor",
              test: /node_modules[\\/]@uiw[\\/]react-md-editor[\\/]/,
              priority: 55,
            },
            {
              name: "markdown",
              test: /node_modules[\\/](react-markdown|remark-gfm|remark-parse|remark-rehype|remark-stringify|unified|vfile|vfile-message|decode-named-character-reference|property-information|space-separated-tokens|comma-separated-tokens|character-entities|character-entities-html4|character-entities-legacy|character-reference-invalid|stringify-entities|parse-entities|longest-streak|markdown-table|escape-string-regexp|extend|is-plain-obj|is-alphabetical|is-alphanumerical|is-decimal|is-hexadecimal|zwitch|ccount|trim-lines|ms|debug|bail|trough|devlop|dequal|inline-style-parser|style-to-js|style-to-object|estree-util-is-identifier-name|html-url-attributes|@ungap[\\/]structured-clone)[\\/]|node_modules[\\/](micromark|mdast-util-|hast-util-|unist-util-|remark-|rehype-)/,
              priority: 58,
              minShareCount: 1,
            },
            {
              name: "xterm",
              test: /node_modules[\\/]@xterm[\\/]/,
              priority: 45,
            },
            {
              name: "query",
              test: /node_modules[\\/]@tanstack[\\/]/,
              priority: 40,
            },
            {
              name: "charts",
              test: /node_modules[\\/]recharts[\\/]/,
              priority: 35,
            },
            {
              name: "particles",
              test: /node_modules[\\/]@tsparticles[\\/]/,
              priority: 30,
            },
            {
              name: "dnd",
              test: /node_modules[\\/]@dnd-kit[\\/]/,
              priority: 25,
            },
            {
              name: "nats",
              test: /node_modules[\\/]@nats-io[\\/]/,
              priority: 20,
            },
            {
              name: "forms",
              test: /node_modules[\\/](react-hook-form|@hookform[\\/]resolvers|zod)[\\/]/,
              priority: 15,
            },
            {
              name: "markdown",
              test: /node_modules[\\/](react-markdown|remark-gfm)[\\/]/,
              priority: 10,
            },
          ],
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
  },
});
