// ============================================================
// POST /api/ifct/revogar-link
// Revoga o link IFCT antes de expirar.
// Clone de convex/ifct.ts:revogarLinkIfct
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql, now } from "../_lib/db";
import { requireAuth, hasRole } from "../_lib/auth";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const auth = await requireAuth(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }
  if (!hasRole(auth.session, "gestor")) {
    return res.status(403).json({ ok: false, error: "Apenas gestor/admin" });
  }

  const { agendamentoId } = req.body || {};
  if (!agendamentoId) {
    return res.status(400).json({ ok: false, error: "agendamentoId obrigatorio" });
  }

  const agRes = await sql`SELECT id FROM agendamentos WHERE id = ${agendamentoId} LIMIT 1`;
  if (!agRes.rows[0]) return res.status(404).json({ ok: false, error: "Agendamento nao encontrado" });

  const agora = now();
  await sql`UPDATE agendamentos SET linkIfct=NULL, linkIfctExpiraEm=NULL, ifctStatus=NULL, ifctData=NULL, atualizadoEm=${agora} WHERE id=${agendamentoId}`;

  return res.status(200).json({ ok: true });
}
