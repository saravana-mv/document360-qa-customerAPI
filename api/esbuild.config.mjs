import { build } from "esbuild";
import { readdirSync } from "fs";
import { join } from "path";

// Find all function entry points
const functionsDir = join("src", "functions");
const entryPoints = readdirSync(functionsDir)
  .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
  .map((f) => join(functionsDir, f));

await build({
  entryPoints,
  bundle: true,
  platform: "node",
  target: "node20",
  outdir: "dist/src/functions",
  format: "cjs",
  // Keep @azure/functions external — SWA runtime provides it
  external: ["@azure/functions"],
  sourcemap: true,
  minify: false, // keep readable for debugging
});

console.log(`Bundled ${entryPoints.length} functions`);
