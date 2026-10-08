import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// Carimba o sw.js com um id único por build: o navegador detecta o novo service worker e o PWA se atualiza sozinho
function swBuildId(): Plugin {
  let root = process.cwd();
  let outDir = "dist";
  return {
    name: "sw-build-id",
    apply: "build",
    configResolved(c) { root = c.root; outDir = c.build.outDir; },
    closeBundle() {
      const file = resolve(root, outDir, "sw.js");
      if (!existsSync(file)) return;
      writeFileSync(file, readFileSync(file, "utf8").replace("__BUILD_ID__", Date.now().toString(36)));
    },
  };
}

export default defineConfig({
  plugins: [react(), swBuildId()],
});
