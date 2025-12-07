import { defineConfig } from "vite";
import { resolve } from "node:path";
import solidPlugin from "vite-plugin-solid";

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      fileName: (format) => `index.${format}.js`,
      name: "ViwoEditor",
    },
    rollupOptions: {
      external: ["solid-js", "@viwo/scripting", "@viwo/shared"],
    },
  },
  plugins: [solidPlugin()],
});
