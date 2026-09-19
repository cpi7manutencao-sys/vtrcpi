// ============================================================
// GET /api/viaturas/list-by-descarga
// Lista viaturas em processo de descarga (emDescarga=1)
// com RLS por role (igual viaturas/list.ts).
// Clone de convex/viaturas.ts:listByDescarga
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { query } from "../_lib/db";
import { requireAuth } from "../_lib/auth";
import { getUserById, getUserUnidadesAutorizadas } from "../_lib/agendamentos-helpers";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const auth = await requireAuth(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }

  const session = auth.session;
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
  } else {
    if (user.unit) unidadesAutorizadas = [user.unit];
  }

  // FIX (William 2026-09-15): defensivo - se NAO eh admin/master e nao tem
  // NENHUMA unidade autorizada, retorna vazio
  const isAdminOrMaster = user.viaturasRole === "admin" || user.isMaster;
  if (!isAdminOrMaster && unidadesAutorizadas.length === 0) {
    return res.status(200).json({ ok: true, viaturas: [] });
  }

  // FIX (William v72): usar ? em vez de $1 (SQLite)
  const wheres: string[] = ["v.emDescarga = 1"];
  const params: any[] = [];

  if (unidadesAutorizadas.length > 0) {
    const ph = unidadesAutorizadas.map(() => "?").join(",");
    wheres.push(`v.opm IN (${ph})`);
    params.push(...unidadesAutorizadas);
  }

  const sqlFinal = `
    SELECT v.*, u.code AS opmCode, u.name AS opmName, u.sigla AS opmSigla
    FROM viaturas v
    LEFT JOIN units u ON u.id = v.opm
    WHERE ${wheres.join(" AND ")}
    ORDER BY v.prefixo
    LIMIT 2000
  `;

  const result = await query(sqlFinal, params);

  return res.status(200).json({
    ok: true,
    viaturas: result.rows.map((row: any) => ({
      ...row,
      _id: String(row.id),
      opm: row.opm ? { _id: String(row.opm), id: row.opm, code: row.opmCode, name: row.opmName, sigla: row.opmSigla } : null,
    })),
  });
}

function parseArr(val: any): number[] {
  if (Array.isArray(val)) return val;
  if (typeof val === "string") { try { return JSON.parse(val); } catch { return []; } }
  return [];
}

