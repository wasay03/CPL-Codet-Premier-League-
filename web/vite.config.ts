import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const backend = process.env.VITE_BACKEND ?? "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": backend,
      "/ws": { target: backend.replace(/^http/, "ws"), ws: true },
    },
  },
  // `vite preview` proxies only /api, which mimics a host without WebSockets (polling mode).
  preview: { port: 4173, proxy: { "/api": backend } },
  build: { outDir: "dist", sourcemap: false },
});
