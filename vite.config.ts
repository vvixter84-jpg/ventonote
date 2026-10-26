import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri запускает фронтенд на фиксированном порту и не должен показывать
// браузерный оверлей ошибок поверх окна приложения.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    host: "127.0.0.1",
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    target: "chrome105",
    sourcemap: false,
  },
});
