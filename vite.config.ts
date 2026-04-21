import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { execSync } from "node:child_process";

// Build version: git short hash + ISO timestamp (e.g. "a1b2c3d.20260421T1430")
function getBuildVersion(): string {
  try {
    const hash = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
    const ts = new Date().toISOString().replace(/[-:]/g, "").slice(0, 13);
    return `${hash}.${ts}`;
  } catch {
    return `dev.${Date.now()}`;
  }
}

const BUILD_VERSION = getBuildVersion();

export default defineConfig({
  base: "/",
  plugins: [react(), tailwindcss()],
  define: {
    __BUILD_VERSION__: JSON.stringify(BUILD_VERSION),
  },
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
