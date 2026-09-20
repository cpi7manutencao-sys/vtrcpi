// ============================================================
// cache.ts - Cache simples em memoria (TTL configuravel)
// Sobrevive entre chamadas dentro da mesma instance serverless.
// NAO sobrevive a cold start.
//
// Uso: cacheUnits.get() / cacheUnits.set(key, value, ttlMs)
// ============================================================

type Entry<T> = {
  value: T;
  expiresAt: number;
};

class MemoryCache {
  private store = new Map<string, Entry<any>>();

  /**
   * Pega valor do cache se ainda nao expirou.
   */
  get<T = any>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value as T;
  }

  /**
   * Seta valor com TTL (em ms).
   */
  set<T = any>(key: string, value: T, ttlMs: number): void {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });
  }

  /**
   * Invalida uma chave (ou pattern).
   */
  del(key: string): void {
    this.store.delete(key);
  }

  /**
   * Invalida todas as chaves que comecam com prefix.
   */
  delByPrefix(prefix: string): number {
    let count = 0;
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
        count++;
      }
    }
    return count;
  }

  /**
   * Limpa todo o cache.
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * Stats pra debug.
   */
  stats(): { size: number; keys: string[] } {
    return {
      size: this.store.size,
      keys: Array.from(this.store.keys()),
    };
  }
}

// Singleton cache pra unidade de cache de toda a aplicacao.
// Vercel serverless cria nova instance por cold start - o cache e perdido.
// Mas em warm instances, ele acumula.
export const cache = new MemoryCache();

// FIX (William 2026-09-20): TTLs padrao
// - units: 10 minutos (imutaveis exceto cadastro raro, via admin)
// - viaturas: 30 segundos (podem mudar via toggle ativo / descarga)
// - unidades hierarquicas: 10 minutos (derivado de units)
export const CACHE_TTL = {
  UNITS: 10 * 60 * 1000,        // 10 min
  VIATURAS: 30 * 1000,          // 30s
  HIERARCHY: 10 * 60 * 1000,    // 10 min
  USER_PROFILE: 60 * 1000,      // 1 min (pode mudar role)
};