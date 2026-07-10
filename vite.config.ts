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
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom", "react-router-dom"],
          query: ["@tanstack/react-query"],
          charts: ["recharts"],
          particles: [
            "@tsparticles/engine",
            "@tsparticles/react",
            "@tsparticles/slim",
          ],
          editor: ["@uiw/react-md-editor"],
          dnd: ["@dnd-kit/core", "@dnd-kit/sortable", "@dnd-kit/utilities"],
          nats: ["@nats-io/nats-core"],
          markdown: ["react-markdown", "remark-gfm"],
          forms: ["react-hook-form", "@hookform/resolvers", "zod"],
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
