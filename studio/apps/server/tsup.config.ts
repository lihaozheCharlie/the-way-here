import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  platform: "node",
  target: "node22",
  outDir: "dist",
  clean: true,
  splitting: false,
  // Workspace packages export TypeScript sources and must be compiled with the server.
  noExternal: [/^@the-way-here\//],
  // Bundled CommonJS dependencies (for example fast-glob) still require Node built-ins.
  banner: { js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);' },
});
