// ============================================================
// GET /api/units/get-by-code?code=XXXX
// Busca unit por code SIAFEM.
// Clone de convex/units.ts:getByCode
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

  const code = (req.query.code as string) || "";
  if (!code) {
    return res.status(400).json({ ok: false, error: "code obrigatorio" });
  }

  const r = await sql`SELECT * FROM units WHERE code = ${code} LIMIT 1`;
  if (!r.rows[0]) return res.status(404).json({ ok: false, error: "Unit nao encontrada" });

  const u = r.rows[0];
  return res.status(200).json({
    ok: true,
    unit: {
      _id: String(u.id),
      id: u.id,
      code: u.code,
      name: u.name,
      parentUnit: u.parentUnit ? String(u.parentUnit) : null,
      commandUnit: u.commandUnit ? String(u.commandUnit) : null,
      active: u.active,
      sigla: u.sigla,
    },
  });
}
