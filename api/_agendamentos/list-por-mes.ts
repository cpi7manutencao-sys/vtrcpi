// ============================================================
// GET /api/agendamentos/list-por-mes?ano=YYYY&mes=M
// Lista agendamentos de um mes (para o calendario).
// Clone de convex/agendamentos.ts:listPorMes
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql, query } from "../_lib/db";
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

  const ano = parseInt((req.query.ano as string) || "0", 10);
  const mes = parseInt((req.query.mes as string) || "0", 10);
  if (!ano || mes < 0 || mes > 11) {
    return res.status(400).json({ ok: false, error: "ano e mes (0-11) sao obrigatorios" });
  }

  const start = new Date(ano, mes, 1).getTime();
  const end = new Date(ano, mes + 1, 1).getTime();

  const session = auth.session;
  const user = await getUserById(session.userId);
  if (!user) return res.status(200).json({ ok: true, agendamentos: [] });

  let rows: any[] = [];
  if (user.viaturasRole === "admin" || user.isMaster) {
    const all = await sql`SELECT * FROM agendamentos WHERE dataMissao >= ${start} AND dataMissao < ${end} ORDER BY dataMissao`;
    rows = all.rows;
  } else if (user.viaturasRole === "gestor" || user.viaturasRole === "editor") {
    const unidades = user.viaturasRole === "gestor"
      ? parseJsonArray(user.unidadesGestor)
      : parseJsonArray(user.unidadesEditor);
    if (!unidades || unidades.length === 0) {
      return res.status(200).json({ ok: true, agendamentos: [] });
    }
    const autorizadas = await getUserUnidadesAutorizadas(unidades);
    if (autorizadas.length === 0) {
      return res.status(200).json({ ok: true, agendamentos: [] });
    }
    const placeholders = autorizadas.map((_, i) => `$${i + 1}`).join(",");
    const all = await query(
      `SELECT * FROM agendamentos
       WHERE dataMissao >= ${start} AND dataMissao < ${end}
         AND unidadeRequerente IN (${placeholders})
       ORDER BY dataMissao`,
      [...autorizadas]
    );
    rows = all.rows;
  } else {
    const all = await sql`SELECT * FROM agendamentos WHERE dataMissao >= ${start} AND dataMissao < ${end} AND solicitante = ${user.id} ORDER BY dataMissao`;
    rows = all.rows;
  }

  return res.status(200).json({ ok: true, agendamentos: rows.map((r: any) => ({ ...r, _id: String(r.id) })) });
}

function parseJsonArray(val: any): number[] {
  if (Array.isArray(val)) return val;
  if (typeof val === "string") {
    try { return JSON.parse(val); } catch { return []; }
  }
  return [];
}
