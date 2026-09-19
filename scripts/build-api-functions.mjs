// scripts/build-api-functions.mjs
// Bundle each api/**/*.ts into a Vercel Function v3 structure
// api/health.ts -> .vercel/output/functions/health.func/index.js (via esbuild)
import { build } from "esbuild";
import { readdirSync, statSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname, basename, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const apiDir = join(__dirname, "..", "api");
const outBase = join(__dirname, "..", ".vercel", "output", "functions");
const root = join(__dirname, "..");

/**
 * Walk api/ recursively, return list of .ts files (skip _lib/).
 */
function walk(dir, base = dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      // Skip _lib/ (shared helpers, not endpoints)
      if (entry === "_lib") continue;
      walk(full, base, files);
    } else if (full.endsWith(".ts")) {
      files.push(full);
    }
  }
  return files;
}

const tsFiles = walk(apiDir);
console.log(`[build-api-functions] ${tsFiles.length} api functions to bundle`);

let ok = 0;
let err = 0;
for (const file of tsFiles) {
  // relative to api/ dir
  const rel = relative(apiDir, file).replaceAll(sep, "/").replace(/\.ts$/, "");
  // rel = "health" or "agendamentos/list" — becomes function name
  // For v3 structure: .vercel/output/functions/<route>/.func/index.js
  const outDir = join(outBase, rel, ".func");
  mkdirSync(outDir, { recursive: true });

  try {
    await build({
      entryPoints: [file],
      bundle: true,
      platform: "node",
      target: "node20",
      format: "esm",
      outfile: join(outDir, "index.js"),
      // Don't bundle better-sqlite3 etc — they're external
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
    console.log(`  ✓ ${rel}`);
  } catch (e) {
    err++;
    console.error(`  ✗ ${rel}: ${e.message}`);
  }
}

console.log(`[build-api-functions] ${ok} ok, ${err} errors`);
if (err > 0) process.exit(1);
