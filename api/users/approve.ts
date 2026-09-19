// ============================================================
// POST /api/users/approve
// Gestor/admin aprova user pendente
// Header: Authorization: Bearer <jwt>
// Body: { userId, viaturasRole (opcional, default: viewer), unidadesGestor (opcional), unidadesEditor (opcional) }
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql, now } from "../_lib/db";
import { requireAuth, hasRole } from "../_lib/auth";
import { audit } from "../_lib/audit";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const auth = await requireAuth(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }
  if (!hasRole(auth.session, "gestor")) {
    return res.status(403).json({ ok: false, error: "Apenas gestores podem aprovar" });
  }

  const { userId, viaturasRole, unidadesGestor, unidadesEditor, unitId } = req.body || {};
  if (!userId) {
    return res.status(400).json({ ok: false, error: "userId obrigatório" });
  }

  const userResult = await sql`SELECT * FROM users WHERE id = ${userId}`;
  if (userResult.rows.length === 0) {
    return res.status(404).json({ ok: false, error: "Usuário não encontrado" });
  }
  const target = userResult.rows[0];
  if (target.approved) {
    return res.status(400).json({ ok: false, error: "Usuário já aprovado" });
  }
  if (target.isMaster) {
    return res.status(400).json({ ok: false, error: "isMaster não pode ser alterado" });
  }

  // Definir role/unidades (FIX William 2026-09-10 v41: schema camelCase)
  const newRole = viaturasRole || "viewer";
  const newGestor = JSON.stringify(unidadesGestor || []);
  const newEditor = JSON.stringify(unidadesEditor || []);
  const finalUnitId = unitId !== undefined ? unitId : target.unit;

  await sql`
    UPDATE users SET
      approved = TRUE,
      active = TRUE,
      viaturasRole = ${newRole},
      unidadesGestor = ${newGestor},
      unidadesEditor = ${newEditor},
      unit = ${finalUnitId},
      promotedAt = ${now()}
    WHERE id = ${userId}
  `;

  await audit(
    auth.session.userId,
    auth.session.cpf,
    "user.approve",
    "user",
    String(userId),
    { viaturasRole: newRole, unidadesGestor: newGestor, unidadesEditor: newEditor, unitId: finalUnitId },
    req
  );

  return res.status(200).json({
    ok: true,
    message: "Usuário aprovado",
    user: { id: userId, approved: true, viaturasRole: newRole, unitId: finalUnitId },
  });
}
