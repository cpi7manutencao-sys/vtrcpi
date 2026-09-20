// ============================================================
// POST /api/agendamentos/reject
// Rejeita agendamento. So gestor/editor pode.
// Clone de convex/agendamentos.ts:reject
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql, now } from "../lib/db";
import { requireAuth } from "../lib/auth";
import { getUserById } from "../lib/agendamentos-helpers";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const auth = await requireAuth(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }

  const { agendamentoId, motivo } = req.body || {};
  if (!agendamentoId || !motivo) {
    return res.status(400).json({ ok: false, error: "agendamentoId e motivo sao obrigatorios" });
  }

  const session = auth.session;
  const user = await getUserById(session.userId);
  if (!user) return res.status(404).json({ ok: false, error: "Usuario nao encontrado" });
  if (user.viaturasRole !== "gestor" && user.viaturasRole !== "admin" && !user.isMaster) {
    return res.status(403).json({ ok: false, error: "Sem permissao para rejeitar" });
  }

  const agRes = await sql`SELECT * FROM agendamentos WHERE id = ${agendamentoId} LIMIT 1`;
  const ag = agRes.rows[0];
  if (!ag) return res.status(404).json({ ok: false, error: "Agendamento nao encontrado" });
  if (ag.status !== "pendente") {
    return res.status(400).json({ ok: false, error: "Agendamento nao esta pendente" });
  }

  // FIX (William 2026-09-20 v68): REJEICAO soh pelo GESTOR DA UNIDADE SOLICITADA.
  // Mesma regra da aprovacao: soh o gestor da unidade DESTINO (unidadeRequerente)
  // pode rejeitar. unidadeOrigem nao conta mais (era conflito de interesse).
  // Master/admin continuam cobrindo unidades em unidadesGestor (lista explicita).
  if (user.viaturasRole !== "admin" && !user.isMaster) {
    const unidadesGestor = parseJsonArray(user.unidadesGestor);
    const unidadesNum = unidadesGestor.map((u: any) => Number(u));
    const cobreReq = ag.unidadeRequerente && unidadesNum.includes(Number(ag.unidadeRequerente));
    if (!cobreReq) {
      return res.status(403).json({ ok: false, error: "Apenas o gestor da unidade solicitada pode rejeitar" });
    }
  }

  const ts = now();
  await sql`
    UPDATE agendamentos
    SET status = 'rejeitado', rejeitadoPor = ${user.id}, rejeitadoEm = ${ts},
        motivoRejeicao = ${motivo}, atualizadoEm = ${ts}
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
