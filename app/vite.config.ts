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
      // pnpm strict resolution: SDK source can't see app node_modules, so alias snarkjs
      snarkjs: path.resolve(__dirname, "node_modules/.pnpm/snarkjs@0.7.6/node_modules/snarkjs"),
    },
  },
});
