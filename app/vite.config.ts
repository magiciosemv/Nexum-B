import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  root: ".",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@nexum/sdk": path.resolve(__dirname, "../sdk/src"),
      snarkjs: path.resolve(__dirname, "node_modules/.pnpm/snarkjs@0.7.6/node_modules/snarkjs"),
    },
  },
  server: {
    proxy: {
      "/rpc": {
        target: "https://devnet.helius-rpc.com",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/rpc/, `/?api-key=${process.env.VITE_HELIUS_API_KEY || ""}`),
      },
    },
  },
});
