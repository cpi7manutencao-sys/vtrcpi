// ============================================================
// POST /api/agendamentos/cancel
// Cancela agendamento (proprio solicitante ou admin).
// Clone de convex/agendamentos.ts:cancel
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql, now } from "../_lib/db";
import { requireAuth } from "../_lib/auth";
import { getUserById } from "../_lib/agendamentos-helpers";

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
  if (!user) return res.status(404).json({ ok: false, error: "Usuario nao encontrado" });

  const agRes = await sql`SELECT * FROM agendamentos WHERE id = ${agendamentoId} LIMIT 1`;
  const ag = agRes.rows[0];
  if (!ag) return res.status(404).json({ ok: false, error: "Agendamento nao encontrado" });

  // So o solicitante ou admin pode cancelar
  if (ag.solicitante !== user.id && user.viaturasRole !== "admin" && !user.isMaster) {
    return res.status(403).json({ ok: false, error: "Sem permissao para cancelar" });
  }

  if (ag.status === "concluido") {
    return res.status(400).json({ ok: false, error: "Agendamento ja concluido, nao pode cancelar" });
  }

  const ts = now();
  await sql`UPDATE agendamentos SET status = 'cancelado', atualizadoEm = ${ts} WHERE id = ${agendamentoId}`;

  return res.status(200).json({ ok: true });
}
