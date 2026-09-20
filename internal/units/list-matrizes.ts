// ============================================================
// GET /api/units/list-matrizes
// Lista APENAS unidades matrizes (sem parentUnit).
// Usado no cadastro pra usuario novo escolher de onde ele eh,
// sem ver as 116 sub-cias. Futuramente o gestor podera atribuir a sub-cia.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { query } from "../lib/db";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  // Endpoint PUBLICO (sem requireAuth) - serve pra user em cadastro
  // que ainda nao tem role/unidades definidas.
  // Retorna so as matrizes (sem filhas) das OPMs da PMESP
  const result = await query(
    `SELECT * FROM units
     WHERE active = TRUE AND parentUnit IS NULL
     ORDER BY code`,
    []
  );

  return res.status(200).json({
    ok: true,
    units: result.rows.map((r: any) => ({
      _id: String(r.id),
      id: r.id,
      code: r.code,
      name: r.name,
      parentUnit: r.parentUnit ? String(r.parentUnit) : null,
      commandUnit: r.commandUnit ? String(r.commandUnit) : null,
      active: r.active,
      sigla: r.sigla,
    })),
  });
}
