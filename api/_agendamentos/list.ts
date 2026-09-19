// ============================================================
// GET /api/agendamentos/list
// Lista agendamentos (RLS por role)
// Clone de convex/agendamentos.ts:list
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql, query } from "../_lib/db";
import { requireAuth } from "../_lib/auth";
import { getUserUnidadesAutorizadas, getUserFromCpf } from "../_lib/agendamentos-helpers";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const auth = await requireAuth(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }

  const status = (req.query.status as string) || null;
  const unidadeId = req.query.unidadeId ? parseInt(req.query.unidadeId as string, 10) : null;
  const session = auth.session;

  // Resolver user (admin: ve tudo, gestor/editor: filtra por unidades, viewer: so os proprios)
  const user = await getUserByIdSafe(session.userId);
  if (!user) {
    return res.status(200).json({ ok: true, agendamentos: [] });
  }

  let rows: any[] = [];
  if (user.viaturasRole === "admin" || user.isMaster === true || user.isMaster === 1) {
    // Admin ve tudo
    const all = await sql`SELECT * FROM agendamentos ORDER BY id DESC`;
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
    // Busca por unidadeRequerente IN (autorizadas) OR solicitante = userId
    const placeholders = autorizadas.map((_, i) => `$${i + 1}`).join(",");
    const all = await query(
      `SELECT * FROM agendamentos
       WHERE unidadeRequerente IN (${placeholders})
          OR solicitante = $${autorizadas.length + 1}
       ORDER BY id DESC`,
      [...autorizadas, user.id]
    );
    rows = all.rows;
  } else {
    // Viewer: so os proprios
    const all = await sql`SELECT * FROM agendamentos WHERE solicitante = ${user.id} ORDER BY id DESC`;
    rows = all.rows;
  }

  // FIX (William 2026-09-14 v58): reatribui partidaConfirmadaEm em cada row
  // usando os dados do ifctEncerramentos (pra agendamentos antigos que ja'
  // tinham encerramento mas nao tem a coluna espelhada - soh os 2 backfilled
  // na migration, mas garantindo leitura correta em qualquer caso).
  // Em agendamentos novos, encerramento.ts ja espelha corretamente.
  for (const row of rows) {
    if (!row.partidaConfirmadaEm) {
      const encRes = await sql`SELECT partidaConfirmadaEm FROM ifctEncerramentos WHERE agendamentoId = ${row.id} LIMIT 1`;
      const ts = encRes.rows[0]?.partidaConfirmadaEm;
      if (ts) row.partidaConfirmadaEm = ts;
    }
  }

  // Filtra por status
  if (status) {
    rows = rows.filter((a: any) => a.status === status);
  }
  // Filtra por unidadeId
  if (unidadeId) {
    rows = rows.filter((a: any) => a.unidadeRequerente === unidadeId);
  }

  // Adiciona _id string (clone Convex 1:1)
  const enriched = rows.map((r: any) => ({ ...r, _id: String(r.id) }));

  return res.status(200).json({ ok: true, agendamentos: enriched });
}

async function getUserByIdSafe(userId: number): Promise<any> {
  const r = await sql`SELECT * FROM users WHERE id = ${userId} LIMIT 1`;
  return r.rows[0] || null;
}

function parseJsonArray(val: any): number[] {
  if (Array.isArray(val)) return val;
  if (typeof val === "string") {
    try { return JSON.parse(val); } catch { return []; }
  }
  return [];
}
