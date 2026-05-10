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
        rewrite: (p) => p.replace(/^\/rpc/, "/?api-key=506b80b3-cae1-4a10-bd37-b048aa5dd8a5"),
      },
    },
  },
});
