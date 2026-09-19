// ============================================================
// POST /api/agendamentos/excluir
// EXCLUI agendamento permanentemente. APENAS ADMIN MASTER pode.
// Clone de convex/agendamentos.ts:excluir
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "../_lib/db";
import { requireAuth } from "../_lib/auth";
import { getUserById, isMasterUser } from "../_lib/agendamentos-helpers";

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
  if (!isMasterUser(user)) {
    return res.status(403).json({ ok: false, error: "Apenas admin master pode excluir agendamentos" });
  }

  const agRes = await sql`SELECT id FROM agendamentos WHERE id = ${agendamentoId} LIMIT 1`;
  if (!agRes.rows[0]) return res.status(404).json({ ok: false, error: "Agendamento nao encontrado" });

  await sql`DELETE FROM agendamentos WHERE id = ${agendamentoId}`;
  return res.status(200).json({ ok: true, id: agendamentoId });
}
