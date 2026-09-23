import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5174,
    proxy: {
      // The local proxy avoids browser CORS setup for this example. A deployed
      // integrator must ask Privara to allow its exact origin or use its own backend.
      "/privara-api": {
        target: "https://privara-production.up.railway.app",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/privara-api/, ""),
      },
    },
  },
  optimizeDeps: { include: ["@privara-stacks/sdk"] },
});
