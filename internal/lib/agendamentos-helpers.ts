// ============================================================
// agendamentos-helpers.ts - Helpers compartilhados (clone de convex/_helpers.ts)
// ============================================================

import { query, sql, type QueryResult } from "./db";

const isSqlite =
  (process.env.POSTGRES_URL || "").startsWith("sqlite://") ||
  !process.env.POSTGRES_URL;

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
 * Retorna a lista de IDs (number[]) das unidades onde o user é gestor/editor,
 * incluindo recursao para sub-OPMs filhas.
 *
 * FIX (William 2026-08-21): alem da hierarquia tecnica (parentUnit),
 * tambem inclui unidades subordinadas via commandUnit.
 *
 * clone de getUserUnidadesAutorizadas do Convex.
 */
export async function getUserUnidadesAutorizadas(
  unidadesDiretas: number[]
): Promise<number[]> {
  if (!unidadesDiretas || unidadesDiretas.length === 0) return [];

  const resultado = new Set<number>();

  for (const unidadeId of unidadesDiretas) {
    await adicionarArvoreCompleta(unidadeId, resultado);
  }

  return Array.from(resultado);
}

async function adicionarArvoreCompleta(
  unidadeId: number,
  resultado: Set<number>
): Promise<void> {
  if (resultado.has(unidadeId)) return;
  resultado.add(unidadeId);

  // 1) Descendentes tecnicos (parentUnit)
  const filhas = await sql`SELECT id FROM units WHERE parentUnit = ${unidadeId} AND active = 1`;
  for (const f of filhas.rows) {
    await adicionarArvoreCompleta(f.id, resultado);
  }

  // 2) Subordinadas funcionais (commandUnit)
  const subordinadas = await sql`SELECT id FROM units WHERE commandUnit = ${unidadeId} AND active = 1`;
  for (const s of subordinadas.rows) {
    await adicionarArvoreCompleta(s.id, resultado);
  }
}

/**
 * Recursao SOMENTE por parentUnit (hierarquia tecnica).
 * clone de getUnidadesDescendentesTecnicos.
 */
export async function getUnidadesDescendentesTecnicos(
  unidadeId: number
): Promise<number[]> {
  const resultado = new Set<number>();
  await adicionarArvoreTecnica(unidadeId, resultado);
  return Array.from(resultado);
}

async function adicionarArvoreTecnica(
  unidadeId: number,
  resultado: Set<number>
): Promise<void> {
  if (resultado.has(unidadeId)) return;
  resultado.add(unidadeId);
  const filhas = await sql`SELECT id FROM units WHERE parentUnit = ${unidadeId} AND active = 1`;
  for (const f of filhas.rows) {
    await adicionarArvoreTecnica(f.id, resultado);
  }
}

/**
 * Retorna a unidade + TODOS os descendentes recursivos.
 * clone de getUnidadesDescendentes.
 */
export async function getUnidadesDescendentes(unidadeId: number): Promise<number[]> {
  return getUserUnidadesAutorizadas([unidadeId]);
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
