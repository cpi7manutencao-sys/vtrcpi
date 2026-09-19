// tools/build-api.mjs
// Bundle api/index.ts (que importa todos os handlers de internal/)
// em um único .js file. Coloca em .vercel/output/functions/api/index.func/index.js
// Usa Build Output API v3 da Vercel
import { build } from "esbuild";
import { mkdirSync, cpSync, existsSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const outBase = join(projectRoot, ".vercel", "output");

console.log("[build-api] Criando .vercel/output/...");

// Cria estrutura
mkdirSync(join(outBase, "functions", "api", "index.func"), { recursive: true });
mkdirSync(join(outBase, "static"), { recursive: true });

// 1. Copia frontend/dist pro .vercel/output/static/
console.log("[build-api] Copiando frontend/dist -> .vercel/output/static/");
cpSync(join(projectRoot, "frontend", "dist"), join(outBase, "static"), { recursive: true });

// 2. Bundle api/index.ts -> .vercel/output/functions/api/index.func/index.js
console.log("[build-api] Bundling api/index.ts...");
await build({
  entryPoints: [join(projectRoot, "tools", "api-entry.ts")],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  outfile: join(outBase, "functions", "api", "index.func", "index.js"),
  external: [
    "@vercel/node",
    "better-sqlite3",
    "@electric-sql/pglite",
    "pdfkit",
    "nodemailer",
    "svg-to-pdfkit",
    // "jose" e "google-auth-library" sao puros JS - bundlear no index.js
    // pra function ser auto-contida (sem depender de node_modules)
    "@vercel/postgres",
  ],
  // Importante: external nao inclui nossas deps locais (internal/)
  // esbuild vai bundle elas automaticamente
  logLevel: "info",
});

// 3. Cria .vercel/output/config.json
console.log("[build-api] Criando .vercel/output/config.json...");
const config = {
  version: 3,
  routes: [
    { "src": "^/api/(.*)$", "dest": "/api/index" },
    { "src": "^/(.*)$", "headers": { "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "strict-origin-when-cross-origin" }, "continue": true },
    { "handle": "filesystem" },
    { "src": "^/(.*)$", "dest": "/index.html", "status": 200 }
  ]
};
writeFileSync(join(outBase, "config.json"), JSON.stringify(config, null, 2));

// 4. Cria .vc-config.json dentro da function folder
console.log("[build-api] Criando .vc-config.json...");
const vcConfig = {
  runtime: "nodejs20.x",
  handler: "index.js",
  launcherType: "Nodejs",
  shouldAddHelpers: false
};
writeFileSync(
  join(outBase, "functions", "api", "index.func", ".vc-config.json"),
  JSON.stringify(vcConfig, null, 2)
);

console.log("[build-api] OK");
console.log("");
console.log("Conteudo .vercel/output/functions/api/index.func/:");
const fs = await import("node:fs/promises");
const files = await fs.readdir(join(outBase, "functions", "api", "index.func"));
for (const f of files) {
  const stat = await fs.stat(join(outBase, "functions", "api", "index.func", f));
  console.log("  " + f + " (" + stat.size + " bytes)");
}
