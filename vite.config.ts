import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Version format: MAJOR.MINOR.BUILD where BUILD = CI run number (or git commit count locally)
function getBuildVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, "package.json"), "utf8")) as { appVersion?: string };
    const base = pkg.appVersion ?? "1.0";
    // CI sets BUILD_NUM env var (GitHub Actions run_number); fall back to git commit count for local dev
    const buildNum = process.env.BUILD_NUM
      || spawnSync("git", ["rev-list", "--count", "HEAD"], { encoding: "utf8" }).stdout?.trim()
      || "0";
    return `${base}.${buildNum}`;
  } catch {
    return "dev";
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
