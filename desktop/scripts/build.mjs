// Bundle server (Fastify) + main process Electron jadi file JS tunggal di build/.
// Dashboard di-build terpisah (npm run build:dashboard); overlay/public disalin apa adanya
// oleh electron-builder (extraResources).
import { build } from "esbuild";
import { rmSync } from "node:fs";

rmSync("build", { recursive: true, force: true });

// Dependensi CJS di dalam bundle ESM butuh require/__dirname asli.
const banner = {
  js: [
    'import { createRequire as __cr } from "node:module";',
    'import { fileURLToPath as __fu } from "node:url";',
    'import { dirname as __dn } from "node:path";',
    "const require = __cr(import.meta.url);",
    "const __filename = __fu(import.meta.url);",
    "const __dirname = __dn(__filename);",
  ].join("\n"),
};

const common = {
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  banner,
  logLevel: "info",
  legalComments: "none",
};

await build({
  ...common,
  entryPoints: ["../server/src/index.ts"],
  outfile: "build/server.mjs",
});

await build({
  ...common,
  entryPoints: ["src/main.ts"],
  outfile: "build/main.js",
  external: ["electron"],
});
