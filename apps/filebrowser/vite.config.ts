import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";

export default defineConfig({
  base: "/lotus/filebrowser/",
  build: {
    target: "esnext",
  },
  plugins: [solidPlugin()],
  server: {
    port: 3003,
  },
});
