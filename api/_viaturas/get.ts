// ============================================================
// GET /api/viaturas/get?id=
// Detalhe de uma viatura
// Clone de convex/viaturas.ts:get
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

  const r = await sql`SELECT * FROM viaturas WHERE id = ${id} LIMIT 1`;
  if (!r.rows[0]) {
    return res.status(404).json({ ok: false, error: "Viatura nao encontrada" });
  }

  // Enriquece com opm info + _id string (clone Convex)
  const viatura = r.rows[0];
  if (viatura) {
    viatura._id = String(viatura.id);
  }
  if (viatura.opm) {
    const unitRes = await sql`SELECT id, code, name, sigla FROM units WHERE id = ${viatura.opm}`;
    if (unitRes.rows[0]) {
      const u = unitRes.rows[0];
      viatura.opm = { _id: String(u.id), id: u.id, code: u.code, name: u.name, sigla: u.sigla };
    }
  }

  return res.status(200).json({ ok: true, viatura });
}
