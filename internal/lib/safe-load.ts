// ============================================================
// safe-load.ts - Helpers pra carregar modulos com seguranca
// Modulos nativos Node (.node binary) ou que dependem de recursos
// de sistema NAO funcionam em Vercel Serverless. Use safeRequire()
// pra carregar lazy e com fallback.
// ============================================================

import { createRequire } from "node:module";
const _require = createRequire(import.meta.url);

/**
 * Tenta carregar um modulo via require. Retorna null se nao existir
 * ou se houver erro (modulo nativo faltando, etc).
 */
export function safeRequire<T = any>(name: string): T | null {
  try {
    return _require(name) as T;
  } catch (e: any) {
    console.warn(`[safe-require] ${name} nao disponivel:`, e.message);
    return null;
  }
}

/**
 * Tenta importar dinamicamente um modulo. Retorna null se nao existir.
 * (Equivalente ESM do safeRequire)
 */
export async function safeImport<T = any>(name: string): Promise<T | null> {
  try {
    const mod = await import(name);
    return mod as T;
  } catch (e: any) {
    console.warn(`[safe-import] ${name} nao disponivel:`, e.message);
    return null;
  }
}
