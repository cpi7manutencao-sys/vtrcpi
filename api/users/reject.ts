// ============================================================
// POST /api/users/reject
// Gestor/admin rejeita user pendente (desativa)
// Header: Authorization: Bearer <jwt>
// Body: { userId, motivo }
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "../_lib/db";
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
    return res.status(403).json({ ok: false, error: "Apenas gestores podem rejeitar" });
  }

  const { userId, motivo } = req.body || {};
  if (!userId) {
    return res.status(400).json({ ok: false, error: "userId obrigatório" });
  }

  const userResult = await sql`SELECT * FROM users WHERE id = ${userId}`;
  if (userResult.rows.length === 0) {
    return res.status(404).json({ ok: false, error: "Usuário não encontrado" });
  }

  await sql`
    UPDATE users SET
      active = FALSE,
      approved = FALSE
    WHERE id = ${userId}
  `;

  await audit(
    auth.session.userId,
    auth.session.cpf,
    "user.reject",
    "user",
    String(userId),
    { motivo: motivo || "" },
    req
  );

  return res.status(200).json({ ok: true, message: "Usuário rejeitado (desativado)" });
}
