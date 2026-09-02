import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  outExtension: ({ format }) => ({ js: format === "cjs" ? ".cjs" : ".js" }),
  dts: true,
  clean: true,
  minify: true,
  treeshake: true,
  sourcemap: true,
  target: "es2020",
});
