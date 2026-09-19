// ============================================================
// POST /api/agendamentos/approve
// Aprova um agendamento. So gestor/editor da unidade REQUERENTE pode.
// Clone de convex/agendamentos.ts:approve
//
// v54 (William 2026-09-14): email pro solicitante foi MOVIDO pro
// atribuir.ts (so sai quando viatura eh atribuida, na hora que o
// ciclo fica completo). Aqui fica so a aprovacao.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql, now } from "../_lib/db";
import { requireAuth } from "../_lib/auth";
import { getUserById, getUserUnidadesAutorizadas } from "../_lib/agendamentos-helpers";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const auth = await requireAuth(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }

  const { agendamentoId } = req.body || {};
  if (!agendamentoId) {
    return res.status(400).json({ ok: false, error: "agendamentoId obrigatorio" });
  }

  const session = auth.session;
  const user = await getUserById(session.userId);
  if (!user) {
    return res.status(404).json({ ok: false, error: "Usuario nao encontrado" });
  }
  if (user.viaturasRole !== "gestor" && user.viaturasRole !== "admin" && !user.isMaster) {
    return res.status(403).json({ ok: false, error: "Sem permissao para aprovar agendamento" });
  }

  const agRes = await sql`SELECT * FROM agendamentos WHERE id = ${agendamentoId} LIMIT 1`;
  const ag = agRes.rows[0];
  if (!ag) return res.status(404).json({ ok: false, error: "Agendamento nao encontrado" });
  if (ag.status !== "pendente") {
    return res.status(400).json({ ok: false, error: "Agendamento nao esta pendente (status=" + ag.status + ")" });
  }

  // Verifica que o user eh gestor de uma das unidades REQUERENTE ou da VIATURA ATRIBUIDA
  // FIX (William 2026-09-16 v77): antes so checava unidadeRequerente. Agora tambem
  // checa se a viatura atribuida eh de uma unidade autorizada (gestor da unidade
  // da viatura pode aprovar mesmo que a unidadeRequerente seja de outra unidade).
  if (user.viaturasRole !== "admin" && !user.isMaster) {
    const unidadesGestor = parseJsonArray(user.unidadesGestor);
    const autorizadas = await getUserUnidadesAutorizadas(unidadesGestor);
    let podeAprovar = false;
    if (ag.unidadeRequerente && autorizadas.includes(ag.unidadeRequerente)) {
      podeAprovar = true;
    }
    // Se tem viatura atribuida, verifica se eh da unidade do gestor
    if (!podeAprovar && ag.viaturaAtribuida) {
      const vtrRes = await sql`SELECT opm FROM viaturas WHERE id = ${ag.viaturaAtribuida} LIMIT 1`;
      const vtrOpm = vtrRes.rows[0]?.opm;
      if (vtrOpm && autorizadas.includes(vtrOpm)) {
        podeAprovar = true;
      }
    }
    if (!podeAprovar) {
      return res.status(403).json({ ok: false, error: "Voce nao tem permissao pra aprovar pedidos dessa unidade/viatura" });
    }
  }

  const ts = now();
  await sql`
    UPDATE agendamentos
    SET status = 'aprovado', aprovadoPor = ${user.id}, aprovadoEm = ${ts}, atualizadoEm = ${ts}
    WHERE id = ${agendamentoId}
  `;

  return res.status(200).json({ ok: true });
}

function parseJsonArray(val: any): number[] {
  if (Array.isArray(val)) return val;
  if (typeof val === "string") {
    try { return JSON.parse(val); } catch { return []; }
  }
  return [];
}
