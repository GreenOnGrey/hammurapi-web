import { defineConfig } from "vitest/config";
import path from "node:path";
import { readFileSync } from "node:fs";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";

// In development the SPA talks to a local api (hammurapi-core) through this proxy,
// so cookies stay same-origin exactly as behind the production ingress.
const api = process.env.HAMMURAPI_API ?? "http://localhost:8080";

// FTR.NAB.CMN-0005 tech §5: with UI_KIT_SRC=../ui-kit the kit is taken from its
// sources, so a change of the kit is seen here at once, before any release. CI
// and the image never set it: they build with the pinned version of the package.
const kit = process.env.UI_KIT_SRC && path.resolve(process.env.UI_KIT_SRC, "src");
const kitAlias = kit ? [
  { find: "@green-on-grey/ui-kit/styles.css", replacement: `${kit}/styles/index.css` },
  { find: "@green-on-grey/ui-kit/chat", replacement: `${kit}/chat/index.ts` },
  { find: "@green-on-grey/ui-kit/login", replacement: `${kit}/login/index.ts` },
  { find: "@green-on-grey/ui-kit/locales", replacement: `${kit}/locales/index.ts` },
  { find: /^@green-on-grey\/ui-kit$/, replacement: `${kit}/index.ts` },
] : [];

// FTR.HMR.SPEC-0004 R7: the viewer of OpenAPI (public/viewers/openapi.html) runs Swagger UI of the exact version
// of package.json; its bundle and styles are served next to the page, never from a CDN.
const swaggerFiles = ["swagger-ui-bundle.js", "swagger-ui.css"];
function swaggerUI(): Plugin {
  const read = (name: string) => readFileSync(path.resolve("node_modules/swagger-ui-dist", name));
  return {
    name: "hammurapi-swagger-ui",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = req.url?.split("?")[0].replace(/^\/viewers\//, "");
        if (!name || !swaggerFiles.includes(name) || !req.url?.startsWith("/viewers/")) return next();
        res.setHeader("Content-Type", name.endsWith(".js") ? "text/javascript" : "text/css");
        res.end(read(name));
      });
    },
    generateBundle() {
      for (const name of swaggerFiles) this.emitFile({ type: "asset", fileName: `viewers/${name}`, source: read(name) });
    },
  };
}

export default defineConfig({
  plugins: [react(), swaggerUI()],
  // one React for the product and the sources of the kit
  resolve: { alias: kitAlias, dedupe: ["react", "react-dom", "i18next", "react-i18next"] },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: api, changeOrigin: false },
      "/admin/api": { target: api, changeOrigin: false },
    },
  },
  build: { sourcemap: true, chunkSizeWarningLimit: 1500 },
  // e2e/*.spec.ts are Playwright tests (npm run shots), not unit tests
  test: { environment: "node", include: ["src/**/*.test.{ts,tsx}"] },
});
