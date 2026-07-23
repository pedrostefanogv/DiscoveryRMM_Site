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
        manualChunks(id: string) {
          if (id.includes("node_modules")) {
            const pkg = id.split("node_modules/")[1];
            const pkgName = pkg.startsWith("@")
              ? pkg.split("/").slice(0, 2).join("/")
              : pkg.split("/")[0];

            const vendorPackages = ["react", "react-dom", "react-router-dom"];
            if (vendorPackages.includes(pkgName)) return "vendor";

            const queryPackages = ["@tanstack/react-query"];
            if (queryPackages.includes(pkgName)) return "query";

            const chartPackages = ["recharts"];
            if (chartPackages.includes(pkgName)) return "charts";

            const particlePackages = [
              "@tsparticles/engine",
              "@tsparticles/react",
              "@tsparticles/slim",
            ];
            if (particlePackages.includes(pkgName)) return "particles";

            const editorPackages = ["@uiw/react-md-editor"];
            if (editorPackages.includes(pkgName)) return "editor";

            const dndPackages = [
              "@dnd-kit/core",
              "@dnd-kit/sortable",
              "@dnd-kit/utilities",
            ];
            if (dndPackages.includes(pkgName)) return "dnd";

            const natsPackages = ["@nats-io/nats-core"];
            if (natsPackages.includes(pkgName)) return "nats";

            const markdownPackages = ["react-markdown", "remark-gfm"];
            if (markdownPackages.includes(pkgName)) return "markdown";

            const formPackages = [
              "react-hook-form",
              "@hookform/resolvers",
              "zod",
            ];
            if (formPackages.includes(pkgName)) return "forms";
          }
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
