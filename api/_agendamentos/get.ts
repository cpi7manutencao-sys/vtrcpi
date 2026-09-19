// ============================================================
// GET /api/agendamentos/get?id=
// Detalhe de 1 agendamento
// Clone de convex/agendamentos.ts:get
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "../_lib/db";
import { requireAuth } from "../_lib/auth";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const auth = await requireAuth(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }

  const id = parseInt((req.query.id as string) || "0", 10);
  if (!id) {
    return res.status(400).json({ ok: false, error: "id obrigatorio" });
  }

  const r = await sql`SELECT * FROM agendamentos WHERE id = ${id} LIMIT 1`;
  if (!r.rows[0]) {
    return res.status(404).json({ ok: false, error: "Agendamento nao encontrado" });
  }

  const ag = r.rows[0];
  return res.status(200).json({ ok: true, agendamento: { ...ag, _id: String(ag.id) } });
}
