// ============================================================
// GET /api/units/list
// Lista unidades com RLS por role (igual viaturas/list.ts).
// FIX (William 2026-09-16 v75): editor/gestor ve so unidades
// autorizadas (matriz + filhas recursivamente). Admin master ve tudo.
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
    return res.status(200).json({ ok: true, units: [] });
  }

  const activeOnly = req.query.activeOnly !== "false";

  // RLS: admin ve tudo, gestor/editor: filtra por unidades autorizadas
  let unidadesAutorizadas: number[] = [];
  const isAdminOrMaster = user.viaturasRole === "admin" || user.isMaster;
  if (isAdminOrMaster) {
    // sem filtro
  } else if (user.viaturasRole === "gestor" || user.viaturasRole === "editor") {
    const unidades = user.viaturasRole === "gestor"
      ? parseArr(user.unidadesGestor)
      : parseArr(user.unidadesEditor);
    if (unidades && unidades.length > 0) {
      unidadesAutorizadas = await getUserUnidadesAutorizadas(unidades);
    }
  } else {
    // viewer: so da dele
    if (user.unit) unidadesAutorizadas = [user.unit];
  }

  // FIX (William 2026-09-15): defensivo - se NAO eh admin/master e nao tem
  // NENHUMA unidade autorizada, retorna vazio
  if (!isAdminOrMaster && unidadesAutorizadas.length === 0) {
    return res.status(200).json({ ok: true, units: [] });
  }

  // Monta query
  const wheres: string[] = [];
  const params: any[] = [];

  if (activeOnly) wheres.push("active = 1");
  if (unidadesAutorizadas.length > 0) {
    const ph = unidadesAutorizadas.map(() => "?").join(",");
    wheres.push(`id IN (${ph})`);
    params.push(...unidadesAutorizadas);
  }
  const whereSql = wheres.length > 0 ? "WHERE " + wheres.join(" AND ") : "";
  const sqlFinal = `SELECT * FROM units ${whereSql} ORDER BY code`;

  const result = await query(sqlFinal, params);

  return res.status(200).json({
    ok: true,
    units: result.rows.map((r: any) => ({
      // Clone Convex 1:1: _id como string
      _id: String(r.id),
      id: r.id,                                      // integer pra queries internas
      _code: r.code,                                 // convencao Convex (mas mantem code tbm)
      code: r.code,
      name: r.name,
      parentUnit: r.parentUnit ? String(r.parentUnit) : null,
      commandUnit: r.commandUnit ? String(r.commandUnit) : null,
      active: r.active,
      sigla: r.sigla,
    })),
  });
}

function parseArr(val: any): number[] {
  if (Array.isArray(val)) return val;
  if (typeof val === "string") { try { return JSON.parse(val); } catch { return []; } }
  return [];
}

