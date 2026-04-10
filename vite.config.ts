import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  base: "/",
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/swagger-proxy": {
        target: "https://apihub.berlin.document360.net",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/swagger-proxy/, ""),
      },
      "/api": {
        target: "http://localhost:7071",
        changeOrigin: true,
      },
    },
  },
});
