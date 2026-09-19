// ============================================================
// POST /api/viaturas/colocar-em-descarga
// Envia viatura para o Processo de Descarte (emDescarga=1).
// Sai da aba Viaturas e fica disponivel apenas na aba "Processo de Descarga".
// Reverte via /api/viaturas/reativar.
// Clone de convex/viaturas.ts:colocarViaturaEmDescarga
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql, now } from "../_lib/db";
import { requireAuth } from "../_lib/auth";
import { getUserById, userPodeAcessarUnidade } from "../_lib/agendamentos-helpers";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const auth = await requireAuth(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }

  const body = req.body || {};
  const viaturaId = parseInt(String(body.viaturaId || 0), 10);
  if (!viaturaId) {
    return res.status(400).json({ ok: false, error: "viaturaId obrigatorio" });
  }

  const session = auth.session;
  const user = await getUserById(session.userId);
  if (!user) return res.status(404).json({ ok: false, error: "Usuario nao encontrado" });
  if (user.viaturasRole !== "editor" && user.viaturasRole !== "admin" && !user.isMaster) {
    return res.status(403).json({ ok: false, error: "Sem permissao para enviar viatura pra descarga" });
  }

  // Pega a viatura pra checar RLS
  const vRes = await sql`SELECT opm FROM viaturas WHERE id = ${viaturaId} LIMIT 1`;
  if (!vRes.rows[0]) return res.status(404).json({ ok: false, error: "Viatura nao encontrada" });

  if (user.viaturasRole !== "admin" && !user.isMaster) {
    const temAcesso = await userPodeAcessarUnidade(user, vRes.rows[0].opm);
    if (!temAcesso) {
      return res.status(403).json({ ok: false, error: "Sem permissao pra enviar viatura dessa unidade" });
    }
  }

  const ts = now();
  await sql`
    UPDATE viaturas SET
      emDescarga = 1,
      atualizadoEm = ${ts},
      atualizadoPor = ${user.id}
    WHERE id = ${viaturaId}
  `;

  return res.status(200).json({ ok: true });
}
