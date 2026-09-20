// ============================================================
// agendamentos-helpers.ts - Helpers compartilhados (clone de convex/_helpers.ts)
// ============================================================

import { query, sql, type QueryResult } from "./db";
import { cache, CACHE_TTL } from "./cache";

const isSqlite =
  (process.env.POSTGRES_URL || "").startsWith("sqlite://") ||
  !process.env.POSTGRES_URL;

/**
 * FIX (William 2026-09-20): Pega TODAS as units com cache.
 * Units sao imutaveis em runtime (so mudam via admin, raro).
 * Cache TTL 10min evita repetir a query SQL em cada request.
 * Cada chamada recursiva de getUserUnidadesAutorizadas faz 1 query
 * `SELECT id FROM units WHERE parentUnit = X` - sem cache, isso vira
 * N+1 e pode fazer 100+ queries pra um user com 50 unidades.
 */
export async function getAllUnitsCached(): Promise<any[]> {
  const cached = cache.get<any[]>("units:all");
  if (cached) return cached;

  const r = await sql`SELECT * FROM units WHERE active = TRUE`;
  const units = r.rows;
  cache.set("units:all", units, CACHE_TTL.UNITS);
  return units;
}

/**
 * FIX (William 2026-09-20): Versao cacheada de getDescendantsRecursivo.
 * Usa a lista de units em cache pra evitar N+1 SQL.
 *
 * Retorna Set<number> com todos os descendentes da matriz.
 */
export function getDescendantsFromCachedUnits(
  units: any[],
  matrizId: number
): Set<number> {
  const byParent = new Map<number, number[]>();
  for (const u of units) {
    if (u.parentUnit != null) {
      const parent = Number(u.parentUnit);
      if (!byParent.has(parent)) byParent.set(parent, []);
      byParent.get(parent)!.push(Number(u.id));
    }
  }
  const visited = new Set<number>();
  function expand(id: number) {
    if (visited.has(id)) return;
    visited.add(id);
    const filhas = byParent.get(id) || [];
    for (const f of filhas) expand(f);
  }
  expand(matrizId);
  return visited;
}

/**
 * Busca user por CPF (limpo, sem pontuacao).
 * Clone de getUserFromCpf do Convex.
 */
export async function getUserFromCpf(cpf: string): Promise<any> {
  if (!cpf) return null;
  const cpfClean = cpf.replace(/\D/g, "");
  const r = await sql`SELECT * FROM users WHERE cpf = ${cpfClean} LIMIT 1`;
  return r.rows[0] || null;
}

/**
 * Busca user por userId.
 */
export async function getUserById(userId: number): Promise<any> {
  const r = await sql`SELECT * FROM users WHERE id = ${userId} LIMIT 1`;
  return r.rows[0] || null;
}

/**
 * Retorna a lista de IDs (number[]) das unidades onde o user Ã© gestor/editor,
 * incluindo recursao para sub-OPMs filhas.
 *
 * FIX (William 2026-08-21): alem da hierarquia tecnica (parentUnit),
 * tambem inclui unidades subordinadas via commandUnit.
 *
 * FIX (William 2026-09-20): usa cache de units pra evitar N+1 SQL.
 *
 * clone de getUserUnidadesAutorizadas do Convex.
 */
export async function getUserUnidadesAutorizadas(
  unidadesDiretas: number[]
): Promise<number[]> {
  if (!unidadesDiretas || unidadesDiretas.length === 0) return [];

  // FIX (William 2026-09-20): tenta cache primeiro
  const cacheKey = "authorized:" + [...unidadesDiretas].sort((a, b) => a - b).join(",");
  const cached = cache.get<number[]>(cacheKey);
  if (cached) return cached;

  // FIX (William 2026-09-20): carrega units via cache (TTL 10min)
  const units = await getAllUnitsCached();
  const unitsByParent = new Map<number, number[]>();
  const unitsByCmd = new Map<number, number[]>();
  const unitsById = new Map<number, any>();
  for (const u of units) {
    const id = Number(u.id);
    unitsById.set(id, u);
    if (u.parentUnit != null) {
      const parent = Number(u.parentUnit);
      if (!unitsByParent.has(parent)) unitsByParent.set(parent, []);
      unitsByParent.get(parent)!.push(id);
    }
    // commandUnit: so conta se NAO aponta pra propria unidade
    if (u.commandUnit != null && Number(u.commandUnit) !== id) {
      const cmd = Number(u.commandUnit);
      if (!unitsByCmd.has(cmd)) unitsByCmd.set(cmd, []);
      unitsByCmd.get(cmd)!.push(id);
    }
  }

  const resultado = new Set<number>();

  function expand(id: number, visited: Set<number>) {
    if (visited.has(id)) return;
    visited.add(id);
    resultado.add(id);
    // parentUnit (recursivo)
    const filhas = unitsByParent.get(id) || [];
    for (const f of filhas) expand(f, visited);
    // commandUnit (1 nivel soh - sem recursao pra evitar loop)
    const subordinadas = unitsByCmd.get(id) || [];
    for (const s of subordinadas) {
      if (!visited.has(s)) {
        resultado.add(s);
        // Nao recursa em commandUnit - evita loop
      }
    }
  }

  for (const unidadeId of unidadesDiretas) {
    expand(unidadeId, new Set());
  }

  const result = Array.from(resultado);
  cache.set(cacheKey, result, CACHE_TTL.HIERARCHY);
  return result;
}

/**
 * Recursao SOMENTE por parentUnit (hierarquia tecnica).
 * FIX (William 2026-09-20): usa cache de units pra evitar N+1 SQL.
 * clone de getUnidadesDescendentesTecnicos.
 */
export async function getUnidadesDescendentesTecnicos(
  unidadeId: number
): Promise<number[]> {
  const cacheKey = "desc:tecnico:" + unidadeId;
  const cached = cache.get<number[]>(cacheKey);
  if (cached) return cached;

  const units = await getAllUnitsCached();
  const result = Array.from(getDescendantsFromCachedUnits(units, unidadeId));
  cache.set(cacheKey, result, CACHE_TTL.HIERARCHY);
  return result;
}

/**
 * Retorna a unidade + TODOS os descendentes recursivos.
 * clone de getUnidadesDescendentes.
 */
export async function getUnidadesDescendentes(unidadeId: number): Promise<number[]> {
  return getUserUnidadesAutorizadas([unidadeId]);
}

/**
 * FIX (William 2026-09-20): pra AGENDAMENTOS usar APENAS hierarquia tecnica
 * (parentUnit), NAO commandUnit.
 *
 * Por que? No backup, TODAS as 10 matrizes tem commandUnit=11 (auto-ref da
 * CPI-7). Se usarmos commandUnit, o gestor da CPI-7 (ug=[11]) veria TUDO
 * (todas as 9 outras matrizes + sub-CPI-7 filhas), independente de onde a
 * solicitacao foi feita.
 *
 * O comportamento desejado: Carlos (gestor CPI-7) deve ver APENAS
 * solicitacoes PRA unidades sob a CPI-7 diretamente (parentUnit=11).
 * Se outra matriz (12BPMI, 22BPMI) recebe sua propria solicitacao, o gestor
 * daquela matriz eh quem aprova - Carlos nao interfere.
 *
 * Retorna Set unico com: cada raiz + suas descendentes tecnicas.
 *
 * Parametros:
 *   unidadesDiretas: lista de unidades onde o user eh gestor/editor
 *   incluirPropriaRaiz: se true, adiciona a propria raiz alem das filhas
 *
 * Ex: PEDRO com ug=[12] -> {12, 21, 22, 23, 93} (12 + sub-CPI-7 filhas)
 * Ex: CARLOS com ug=[11] -> {11} (sem filhas, pq matrizes nao tem parentUnit)
 */
export async function getUnidadesAutorizadasTecnicas(
  unidadesDiretas: number[]
): Promise<number[]> {
  if (!unidadesDiretas || unidadesDiretas.length === 0) return [];
  const resultado = new Set<number>();
  for (const id of unidadesDiretas) {
    const descendentes = await getUnidadesDescendentesTecnicos(id);
    descendentes.forEach(d => resultado.add(d));
  }
  return Array.from(resultado);
}

/**
 * Verifica se o user tem o role minimo necessario.
 * Lanca erro se nao tiver.
 */
export function requireViaturasRole(
  user: any | null,
  rolesPermitidos: string[]
) {
  if (!user) throw new Error("Usuario nao autenticado");
  if (!user.viaturasRole) throw new Error("Usuario sem role no app viaturas");
  if (!rolesPermitidos.includes(user.viaturasRole)) {
    throw new Error(
      "Sem permissao. Requer: " + rolesPermitidos.join(" ou ") +
      ". Atual: " + user.viaturasRole
    );
  }
}

/**
 * Admin master.
 */
export function isMasterUser(user: any): boolean {
  return user?.isMaster === true || user?.isMaster === 1;
}

export function requireMaster(user: any) {
  if (!user) throw new Error("Usuario nao autenticado");
  if (!isMasterUser(user)) {
    throw new Error("Apenas admin master pode fazer essa acao");
  }
}

/**
 * Resolve a unidade de ORIGEM do PM (de onde ele eh lotado).
 * clone de getUserUnit do Convex.
 *
 * Ordem de resolucao:
 * 1. user.unit (FK direto)
 * 2. user.opmCode exato (busca unit por code SIAFEM)
 * 3. Matriz do prefixo SIAFEM (XXX XX 0000)
 * 4. Qualquer sub do mesmo prefixo
 */
export async function getUserUnit(user: any): Promise<number | undefined> {
  if (user.unit) return user.unit;
  if (!user.opmCode) return undefined;
  const opm = user.opmCode;

  // 2) Match exato
  const exata = await sql`SELECT id FROM units WHERE code = ${opm} LIMIT 1`;
  if (exata.rows[0]) return exata.rows[0].id;

  // 3) Matriz (XXX XX 0000)
  if (opm.length === 9) {
    const matrizCode = opm.substring(0, 5) + "0000";
    if (matrizCode !== opm) {
      const matriz = await sql`SELECT id FROM units WHERE code = ${matrizCode} LIMIT 1`;
      if (matriz.rows[0]) return matriz.rows[0].id;
    }

    // 4) Qualquer sub do mesmo prefixo
    const prefixo5 = opm.substring(0, 5);
    const all = await sql`SELECT id, code FROM units WHERE code LIKE ${prefixo5 + "%"}`;
    if (all.rows[0]) return all.rows[0].id;
  }

  return undefined;
}

/**
 * Verifica se o user pode acessar uma unidade especifica.
 */
export async function userPodeAcessarUnidade(
  user: any,
  unidadeId: number
): Promise<boolean> {
  if (!user?.viaturasRole) return false;
  if (user.viaturasRole === "admin") return true;

  const unidadesDiretas =
    user.viaturasRole === "gestor" ? (user.unidadesGestor || []) :
    user.viaturasRole === "editor" ? (user.unidadesEditor || []) :
    user.unit ? [user.unit] : [];

  if (!unidadesDiretas || unidadesDiretas.length === 0) return false;

  const unidadesAutorizadas = await getUserUnidadesAutorizadas(unidadesDiretas);
  return unidadesAutorizadas.includes(unidadeId);
}
