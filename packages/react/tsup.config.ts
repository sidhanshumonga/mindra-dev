import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.tsx"],
  format: ["esm", "cjs"],
  outExtension: ({ format }) => ({ js: format === "cjs" ? ".cjs" : ".js" }),
  dts: true,
  clean: true,
  minify: true,
  treeshake: true,
  sourcemap: true,
  target: "es2020",
  external: ["react", "react-dom", "@mindra.dev/core"],
  // The "use client" directive is re-added and asserted by
  // scripts/add-use-client.mjs after this build; tsup's own banner option does
  // not survive here.
});
