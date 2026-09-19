#!/usr/bin/env node
// scripts/build-vercel-output.cjs
// Bundle Vite frontend + esbuild cada api/*.ts e coloca em .vercel/output/
// Estrutura esperada pelo Build Output API v3

const { build } = require("esbuild");
const { readdirSync, statSync, mkdirSync } = require("node:fs");
const { join, dirname, relative, sep } = require("node:path");

const root = join(__dirname, "..");
const apiDir = join(root, "api");
const vercelOut = join(root, ".vercel", "output");

console.log("[build-vercel-output] Criando .vercel/output/...");
mkdirSync(join(vercelOut, "static"), { recursive: true });
mkdirSync(join(vercelOut, "functions"), { recursive: true });

// 1. Copiar frontend/dist/* para .vercel/output/static/
console.log("[build-vercel-output] Copiando frontend/dist/* -> .vercel/output/static/");
const distDir = join(root, "frontend", "dist");
function copyRecursive(src, dest) {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    const fullSrc = join(src, entry);
    const fullDest = join(dest, entry);
    if (statSync(fullSrc).isDirectory()) {
      copyRecursive(fullSrc, fullDest);
    } else {
      require("fs").copyFileSync(fullSrc, fullDest);
    }
  }
}
copyRecursive(distDir, join(vercelOut, "static"));

// 2. Gerar .vercel/output/config.json
const configPath = join(vercelOut, "config.json");
require("fs").writeFileSync(configPath, JSON.stringify({
  version: 3,
  cleanUrls: false,
  functions: {
    "api/**/*.js": { maxDuration: 30 }
  },
  routes: [
    { src: "^/api/(.+)$", dest: "/api/$1" },
    { src: "^/(.*)$", headers: { "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "strict-origin-when-cross-origin" }, continue: true },
    { handle: "filesystem" },
    { src: "^/(.*)$", dest: "/index.html", status: 200 }
  ]
}, null, 2));
console.log("[build-vercel-output] config.json gerado");

// 3. Bundle cada api/*.ts (skip _lib/)
console.log("[build-vercel-output] Bundling api functions...");
function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "_lib") continue;
      walk(full, files);
    } else if (full.endsWith(".ts")) {
      files.push(full);
    }
  }
  return files;
}

const tsFiles = walk(apiDir);
let ok = 0, err = 0;

(async () => {
  for (const file of tsFiles) {
    const rel = relative(apiDir, file).replaceAll(sep, "/").replace(/\.ts$/, "");
    // Vercel Build Output API v3 requires functions under `functions/api/<route>`
    // to be served at /api/<route>. Without the `api/` prefix, requests like
    // /api/agendamentos/list won't match.
    const outDir = join(vercelOut, "functions", "api", rel, ".func");
    mkdirSync(outDir, { recursive: true });
    try {
      await build({
        entryPoints: [file],
        bundle: true,
        platform: "node",
        target: "node20",
        format: "esm",
        outfile: join(outDir, "index.js"),
        external: [
          "@vercel/node",
          "better-sqlite3",
          "@electric-sql/pglite",
          "pdfkit",
          "nodemailer",
          "jose",
          "google-auth-library",
          "svg-to-pdfkit",
        ],
        logLevel: "silent",
      });
      ok++;
    } catch (e) {
      err++;
      console.error(`  ERROR ${rel}: ${e.message}`);
    }
  }
  console.log(`[build-vercel-output] ${ok}/${tsFiles.length} functions bundled`);

  // 4. Preset .vc-config.json for build output API v3
  const vcConfigPath = join(vercelOut, ".vc-config.json");
  require("fs").writeFileSync(vcConfigPath, JSON.stringify({
    runtime: "nodejs20.x",
    handler: "index.js",
    architecture: "x86_64",
    memory: 512,
    maxDuration: 30,
    environment: {},
    layers: [],
    supportsMultiPayloads: false,
    supportsResponseStreaming: false,
  }, null, 2));
  console.log("[build-vercel-output] .vc-config.json criado");

  console.log("[build-vercel-output] DONE!");
})();
