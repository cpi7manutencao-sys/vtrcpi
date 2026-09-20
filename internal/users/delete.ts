// ============================================================
// POST /api/users/delete
// Admin master exclui um usuario do sistema.
// Header: Authorization: Bearer <jwt>
// Body: { userId: number }
//
// FIX (William 2026-09-20): admin precisa poder excluir usuarios.
// - Apenas isMaster (William) pode excluir
// - NAO pode excluir a si mesmo
// - Soft delete (active=FALSE) preserva auditLog e FKs
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "../lib/db";
import { requireAuth } from "../lib/auth";
import { audit } from "../lib/audit";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const auth = await requireAuth(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }

  const session = auth.session;

  // Apenas admin master pode excluir
  if (!session.isMaster) {
    return res.status(403).json({ ok: false, error: "Apenas admin master pode excluir usuarios" });
  }

  const { userId } = req.body || {};
  if (!userId || typeof userId !== "number") {
    return res.status(400).json({ ok: false, error: "userId (number) obrigatorio" });
  }

  // Nao pode excluir a si mesmo
  if (userId === session.userId) {
    return res.status(400).json({ ok: false, error: "Voce nao pode excluir seu proprio usuario" });
  }

  // Confirma que o user existe
  const target = await sql`SELECT id, email, cpf, name FROM users WHERE id = ${userId} LIMIT 1`;
  if (!target.rows[0]) {
    return res.status(404).json({ ok: false, error: "Usuario nao encontrado" });
  }

  // Soft delete (active=FALSE) preserva FKs e auditLog
  // NOTA: tabela users nao tem coluna atualizadoEm no schema atual
  await sql`UPDATE users SET active = FALSE WHERE id = ${userId}`;

  // Auditoria
  await audit(
    session.userId,
    session.cpf,
    "user.delete",
    "user",
    String(userId),
    { email: target.rows[0].email, cpf: target.rows[0].cpf },
    req
  );

  return res.status(200).json({
    ok: true,
    message: "Usuario excluido (soft delete)",
    userId,
  });
}
