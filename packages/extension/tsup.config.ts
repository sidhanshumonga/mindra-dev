import { defineConfig } from "tsup";

export default defineConfig({
  entry: { panel: "src/panel.ts" },
  outDir: "devtools",
  // A DevTools panel loads one plain script tag; an IIFE with the scoring
  // bundled in keeps the extension free of any module or network loading.
  format: ["iife"],
  // tsup appends ".global" to IIFE output; panel.html loads "panel.js".
  outExtension: () => ({ js: ".js" }),
  noExternal: ["@mindra.dev/core"],
  clean: false,
  minify: false,
  sourcemap: false,
  target: "es2020",
});
