// ============================================================
// GET /api/viaturas/list
// Lista viaturas (clone de convex/viaturas.ts:list)
// Query: ?opm=<unitId>&ativo=true|false&tipo=CR|MT&unidadeId=<id>
// Header: Authorization: Bearer <jwt>
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql, query } from "../_lib/db";
import { requireAuth } from "../_lib/auth";
import { getUserById, getUserUnidadesAutorizadas, getUnidadesDescendentesTecnicos } from "../_lib/agendamentos-helpers";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const auth = await requireAuth(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }

  const session = auth.session;
  const opm = (req.query.opm as string) || null;
  const ativo = req.query.ativo === "false" ? 0 : req.query.ativo === "true" ? 1 : null;
  const tipo = (req.query.tipo as string) || null;
  const unidadeId = req.query.unidadeId ? parseInt(req.query.unidadeId as string, 10) : null;

  const user = await getUserById(session.userId);
  if (!user) {
    return res.status(200).json({ ok: true, viaturas: [] });
  }

  // RLS: admin ve tudo, gestor/editor: filtra por unidades autorizadas, viewer: so da dele
  let unidadesAutorizadas: number[] = [];
  if (user.viaturasRole === "admin" || user.isMaster) {
    // sem filtro
  } else if (user.viaturasRole === "gestor" || user.viaturasRole === "editor") {
    const unidades = user.viaturasRole === "gestor"
      ? parseArr(user.unidadesGestor)
      : parseArr(user.unidadesEditor);
    if (unidades && unidades.length > 0) {
      unidadesAutorizadas = await getUserUnidadesAutorizadas(unidades);
    }
    // FIX (William 2026-09-15): SEM unidades = 0 autorizadas (defensivo).
    // Antes ficava [] silenciosamente e o WHERE nao filtrava -> retornava TUDO.
    // Agora: editor sem unidades nao ve NADA (defensivo).
    // unidadesAutorizadas continua [] = WHERE v.opm IN () = zero rows.
  } else {
    // viewer
    if (user.unit) unidadesAutorizadas = [user.unit];
  }

  // Filtro do usuario (UI): so hierarquia tecnica (parentUnit) - clone do Convex
  let descendentes: number[] = [];
  if (opm) {
    descendentes = await getUnidadesDescendentesTecnicos(parseInt(opm, 10));
  }
  if (unidadeId) {
    descendentes = [unidadeId];
  }

  // Monta WHERE
  // FIX (William 2026-09-15): better-sqlite3 usa ? placeholders (nao $1)
  const wheres: string[] = ["v.emDescarga = 0"]; // exclui descarga
  const params: any[] = [];

  if (unidadesAutorizadas.length > 0) {
    const ph = unidadesAutorizadas.map(() => "?").join(",");
    wheres.push(`v.opm IN (${ph})`);
    params.push(...unidadesAutorizadas);
  }
  if (descendentes.length > 0) {
    const ph = descendentes.map(() => "?").join(",");
    wheres.push(`v.opm IN (${ph})`);
    params.push(...descendentes);
  }
  if (ativo !== null) {
    wheres.push(`v.ativo = ?`);
    params.push(ativo);
  }
  if (tipo) {
    wheres.push(`v.tipo = ?`);
    params.push(tipo);
  }

  const sqlFinal = `
    SELECT v.*, u.code AS opmCode, u.name AS opmName, u.sigla AS opmSigla
    FROM viaturas v
    LEFT JOIN units u ON u.id = v.opm
    WHERE ${wheres.join(" AND ")}
    ORDER BY u.code, v.prefixo
    LIMIT 2000
  `;

  // FIX (William 2026-09-15): se user NAO eh admin/master e nao tem NENHUMA
  // unidade autorizada (unidadesAutorizadas=[]) E nenhum opm na query,
  // forcar 0 results (defensivo contra bypass de RLS).
  // Sem esse guard, um editor com unidades=[] receberia TODAS as viaturas
  // porque o WHERE nao filtra nada.
  const isAdminOrMaster = user.viaturasRole === "admin" || user.isMaster;
  if (!isAdminOrMaster && unidadesAutorizadas.length === 0 && descendentes.length === 0) {
    return res.status(200).json({ ok: true, viaturas: [] });
  }

  const result = await query(sqlFinal, params);

  // Adiciona objeto opm aninhado + _id como string (clone Convex)
  const viaturas = result.rows.map((r: any) => ({
    ...r,
    _id: String(r.id),
    opm: r.opm ? { _id: String(r.opm), id: r.opm, code: r.opmCode, name: r.opmName, sigla: r.opmSigla } : null,
  }));

  return res.status(200).json({ ok: true, viaturas });
}

function parseArr(val: any): number[] {
  if (Array.isArray(val)) return val;
  if (typeof val === "string") { try { return JSON.parse(val); } catch { return []; } }
  return [];
}
