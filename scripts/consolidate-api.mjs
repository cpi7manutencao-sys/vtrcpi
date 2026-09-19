// scripts/consolidate-api.mjs
import { renameSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const apiDir = join(__dirname, "..", "api");

const prefixDirs = [
  "auth",
  "users",
  "units",
  "agendamentos",
  "dashboard",
  "ifct",
  "rondas",
  "viaturas",
  "viatura-historico",
];

console.log("[consolidate-api] Renomeando pastas...");

for (const dir of prefixDirs) {
  const oldPath = join(apiDir, dir);
  const newPath = join(apiDir, "_" + dir);
  try {
    renameSync(oldPath, newPath);
    console.log(`  ${dir}/ -> _${dir}/`);
  } catch (e) {
    if (e.code === "ENOENT") {
      console.log(`  ${dir}/ nao existe (skip)`);
    } else {
      throw e;
    }
  }
}

const healthOld = join(apiDir, "health.ts");
const handlersDir = join(apiDir, "_handlers");
mkdirSync(handlersDir, { recursive: true });
try {
  const data = readFileSync(healthOld, "utf-8");
  const updated = data.replace(/from\s+["']\.\/_lib\//g, 'from "../_lib/');
  writeFileSync(join(handlersDir, "health.ts"), updated, "utf-8");
  console.log(`  health.ts -> _handlers/health.ts (imports ajustados)`);
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}

console.log("[consolidate-api] OK");
