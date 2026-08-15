import { defineConfig } from "vite";

export default defineConfig({
  // Отдаётся только /assets/web — облегчённые версии. Оригиналы из /assets
  // в сборку не попадают и по сети не уходят.
  publicDir: "assets/web",
  server: { host: true },
  build: {
    target: "es2020",
    assetsInlineLimit: 0,
  },
});
