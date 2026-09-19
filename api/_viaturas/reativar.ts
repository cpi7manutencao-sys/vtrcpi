// ============================================================
// POST /api/viaturas/reativar
// Reativa viatura (sai do estado de descarte).
// Zera emDescarga e marca ativo=true.
// Clone de convex/viaturas.ts:reativar
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql, now } from "../_lib/db";
import { requireAuth } from "../_lib/auth";
import { getUserById } from "../_lib/agendamentos-helpers";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const auth = await requireAuth(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }

  const { id } = req.body || {};
  if (!id) {
    return res.status(400).json({ ok: false, error: "id obrigatorio" });
  }

  const session = auth.session;
  const user = await getUserById(session.userId);
  if (!user) return res.status(404).json({ ok: false, error: "Usuario nao encontrado" });
  if (user.viaturasRole !== "admin" && user.viaturasRole !== "gestor" && user.viaturasRole !== "editor" && !user.isMaster) {
    return res.status(403).json({ ok: false, error: "Sem permissao" });
  }

  const v = await sql`SELECT id FROM viaturas WHERE id = ${id} LIMIT 1`;
  if (!v.rows[0]) return res.status(404).json({ ok: false, error: "Viatura nao encontrada" });

  const ts = now();
  await sql`
    UPDATE viaturas
    SET ativo = 1, emDescarga = 0, atualizadoEm = ${ts}, atualizadoPor = ${user.id}
    WHERE id = ${id}
  `;

  return res.status(200).json({ ok: true, id, reativada: true });
}
