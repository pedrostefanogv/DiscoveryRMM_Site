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
      // favicon.svg nunca existiu no repo; precache dos icones que existem.
      includeAssets: ["icon.ico", "apple-touch-icon.png"],
      // injectManifest habilita um Service Worker proprio com handler de push
      // (Web Push). O fallback de navegacao da SPA passa a ser declarado em
      // src/sw.ts, com a mesma denylist de API/docs/realtime.
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,webmanifest}"],
      },
      manifest: {
        name: "Discovery RMM",
        short_name: "Discovery",
        description: "Remote Monitoring & Management",
        theme_color: "#6366f1",
        background_color: "#0f172a",
        display: "standalone",
        // O console e pt-BR (index.html lang="pt-BR"); o manifest declarava "en".
        lang: "pt-BR",
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
      // import.meta.dirname (ESM) — __dirname não é suportado pelo
      // configLoader "native" do Vite 8 (aviso de deprecação no build).
      "@": resolve(import.meta.dirname, "src"),
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
      // WebSocket do NATS em dev (VITE_NATS_URL=/nats resolve contra a origem
      // do dev server). Ajuste o target conforme o listener WS do seu NATS.
      "/nats": {
        target: "http://localhost:4222",
        changeOrigin: true,
        ws: true,
      },
    },
  },
  build: {
    target: "es2022",
    // O chunk "markdown" (react-markdown + remark/rehype/micromark) tem ~1,1 MB
    // (≈381 kB gzip) e é carregado SOB DEMANDA via LazyMarkdown — não entra no
    // bundle inicial nem no das rotas. O limite é ajustado para esse caso
    // conhecido; qualquer outro chunk que passe de 1,2 MB volta a avisar.
    chunkSizeWarningLimit: 1200,
    rolldownOptions: {
      output: {
        // Rolldown-native chunking (substitui o advancedChunks/manualChunks legado).
        // Cada grupo usa `test` (regex sobre o caminho do módulo) e `priority`.
        codeSplitting: {
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
              // Ecossistema de markdown (react-markdown + remark/rehype/hast/micromark
              // + helpers do preview do editor). Fica num chunk vendor único
              // porque tudo é carregado junto quando um markdown é renderizado;
              // o download é sob demanda via LazyMarkdown (components/ui/LazyMarkdown.tsx).
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
