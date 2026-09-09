import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  // The local SDK currently publishes CommonJS. Because npm links it from ../sdk,
  // force Vite to prebundle it for development and convert its real path for builds.
  optimizeDeps: {
    include: ["@privara-stacks/sdk"],
  },
  build: {
    commonjsOptions: { include: [/node_modules/, /sdk\/dist/] },
  },
});
