// ============================================================
// safe-load.ts - Helpers pra carregar modulos com seguranca
// Modulos nativos Node (.node binary) ou que dependem de recursos
// de sistema NAO funcionam em Vercel Serverless.
//
// Usa require() direto (CommonJS nativo). Em bundle ESM do esbuild,
// o require vem do globals; em bundle CJS, e o require nativo.
// ============================================================

// require_ e resolvido lazy pra nao quebrar o load do modulo
// Em Vercel Serverless, require existe globalmente (CJS ou emulado)
let _safeRequire: any = null;
function getRequire(): any {
  if (_safeRequire) return _safeRequire;
  if (typeof require !== "undefined") {
    _safeRequire = require;
    return _safeRequire;
  }
  return null;
}

/**
 * Tenta carregar um modulo via require. Retorna null se nao existir.
 */
export function safeRequire<T = any>(name: string): T | null {
  const r = getRequire();
  if (!r) {
    console.warn(`[safe-require] ${name}: no require() available in this environment`);
    return null;
  }
  try {
    return r(name) as T;
  } catch (e: any) {
    console.warn(`[safe-require] ${name} nao disponivel:`, e.message);
    return null;
  }
}

/**
 * Tenta importar dinamicamente um modulo. Retorna null se nao existir.
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
