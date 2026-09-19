// scripts/move-handlers-out.mjs
// Move api/_* handlers para internal/handlers/ (fora de api/)
// Assim a Vercel NAO exclui do bundle
import { renameSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const apiDir = join(projectRoot, "api");
const internalDir = join(projectRoot, "internal");

// Pastas a mover
const dirsToMove = ["_lib", "_auth", "_users", "_units", "_agendamentos", "_dashboard", "_ifct", "_rondas", "_viaturas", "_viatura-historico", "_handlers"];

// Arquivos a mover (na raiz de api/)
const filesToMove = [];

// Cria internal/
mkdirSync(internalDir, { recursive: true });

console.log("[move-handlers-out] Movendo handlers de api/_* -> internal/ ...");

// Move diretorios
for (const dir of dirsToMove) {
  const oldPath = join(apiDir, dir);
  const newName = dir.replace(/^_/, ""); // remove prefixo _
  const newPath = join(internalDir, newName);
  try {
    renameSync(oldPath, newPath);
    console.log(`  api/${dir} -> internal/${newName}`);
  } catch (e) {
    if (e.code === "ENOENT") {
      console.log(`  api/${dir} nao existe (skip)`);
    } else {
      throw e;
    }
  }
}

// Atualiza imports nos arquivos movidos
//   "../_lib/db" -> "../../_lib/db" (porque saimos de internal/handlers/* pra internal/_lib/)
//   "../../_lib/db" -> "../../_lib/db" (mesmo)
// Wait, vamos pensar:
//   old: api/_users/approve.ts (imports "../_lib/db" = sai de _users/, sobe pra api/, entra _lib/db)
//   new: internal/users/approve.ts (imports agora deve ser "../../_lib/db" = sai de users/, sobe pra internal/, entra _lib/db)
function fixImports(filePath) {
  const content = readFileSync(filePath, "utf-8");
  let fixed = content;
  // "../_lib" -> "../../_lib" (porque subiu um nivel)
  fixed = fixed.replace(/from\s+["']\.\.\/_lib\//g, 'from "../../_lib/');
  // "../../_lib" -> "../../_lib" (no-op, mas garante)
  // "./_lib" -> "../../_lib" (mesma pasta)
  fixed = fixed.replace(/from\s+["']\.\/_lib\//g, 'from "../../_lib/');
  if (fixed !== content) {
    writeFileSync(filePath, fixed, "utf-8");
    return true;
  }
  return false;
}

function walk(dir, base = dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, base, files);
    } else if (full.endsWith(".ts") || full.endsWith(".mjs") || full.endsWith(".cjs")) {
      files.push(full);
    }
  }
  return files;
}

console.log("[move-handlers-out] Atualizando imports nos arquivos movidos...");
const allFiles = walk(internalDir);
let updatedCount = 0;
for (const file of allFiles) {
  if (fixImports(file)) {
    updatedCount++;
  }
}
console.log(`  ${updatedCount} arquivos atualizados`);

console.log("[move-handlers-out] OK");
