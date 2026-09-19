// ============================================================
// GET /api/users/pending
// Lista users pendentes de aprovacao (approved=0, isMaster=0)
// Apenas GESTOR ou ADMIN podem ver
// Header: Authorization: Bearer <jwt>
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "../_lib/db";
import { requireAuth, hasRole } from "../_lib/auth";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const auth = await requireAuth(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }
  if (!hasRole(auth.session, "gestor")) {
    return res.status(403).json({ ok: false, error: "Apenas gestores podem ver pendentes" });
  }

  const result = await sql`
    SELECT u.*, un.name as unitName, un.code as unitCode, un.sigla as unitSigla
    FROM users u
    LEFT JOIN units un ON un.id = u.unit
    WHERE u.approved = 0
      AND u.isMaster = 0
      AND u.cpf IS NOT NULL
    ORDER BY u.createdAt ASC
  `;

  return res.status(200).json({
    ok: true,
    pending: result.rows.map((r: any) => ({
      id: r.id,
      email: r.email,
      name: r.name,
      picture: r.picture,
      cpf: r.cpf,
      re: r.re,
      digre: r.digre,
      warName: r.warName,
      postoGraduacao: r.postoGraduacao,
      codptgr: r.codptgr,
      unitId: r.unit,
      unit: r.unit ? {
        id: r.unit,
        name: r.unitName,
        code: r.unitCode,
        sigla: r.unitSigla,
      } : null,
      opmCode: r.opmCode,
      createdAt: r.createdAt,
    })),
  });
}
