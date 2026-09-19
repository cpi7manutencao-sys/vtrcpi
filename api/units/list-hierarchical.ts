// ============================================================
// GET /api/units/list-hierarchical
// Lista hierarquica (matrizes + 1 nivel de filhos).
// Clone de convex/units.ts:listHierarchical
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

  const r = await sql`SELECT * FROM units WHERE active = 1 ORDER BY code`;
  const all: any[] = r.rows;
  const matrizes = all.filter((u: any) => !u.parentUnit);

  const mapUnit = (u: any) => ({
    _id: String(u.id),
    id: u.id,
    code: u.code,
    name: u.name,
    parentUnit: u.parentUnit ? String(u.parentUnit) : null,
    commandUnit: u.commandUnit ? String(u.commandUnit) : null,
    active: u.active,
    sigla: u.sigla,
  });

  const result = matrizes.map((m: any) => ({
    ...mapUnit(m),
    filhos: all
      .filter((u: any) => u.parentUnit && u.parentUnit === m.id)
      .map(mapUnit),
  }));

  return res.status(200).json({ ok: true, units: result });
}
