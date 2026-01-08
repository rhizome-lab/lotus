import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";

export default defineConfig({
  base: "/lotus/notes/",
  build: {
    target: "esnext",
  },
  plugins: [solidPlugin()],
  server: {
    port: 3004,
  },
});
