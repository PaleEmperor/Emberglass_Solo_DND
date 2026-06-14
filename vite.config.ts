import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  root: "frontend",
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      "/api": "http://127.0.0.1:8787",
      "/artwork": "http://127.0.0.1:8787"
    }
  },
  build: {
    outDir: "../dist/frontend",
    emptyOutDir: true
  }
});
