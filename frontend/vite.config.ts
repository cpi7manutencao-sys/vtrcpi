import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite config - Sistema de Viaturas CPI-7 (Vercel)
// Em dev: server-local.mjs roda na 3001 e Vite faz proxy /api -> 3001
// Em prod: Vercel serve /api/* direto

export default defineConfig({
  base: "",
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
