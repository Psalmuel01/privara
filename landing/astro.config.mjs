import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://www.useprivara.xyz",
  integrations: [sitemap()],
  build: { inlineStylesheets: "auto" },
  prefetch: false,
});
