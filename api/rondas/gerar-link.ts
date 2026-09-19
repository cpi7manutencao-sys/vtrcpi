// ============================================================
// POST /api/rondas/gerar-link
// Gera/retorna o link FIXO de ronda para a viatura (UUID persistente).
// Clone de convex/rondas.ts:gerarLinkRonda
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql, now } from "../_lib/db";
import { requireAuth, hasRole } from "../_lib/auth";
import { getUserById, getUserUnidadesAutorizadas } from "../_lib/agendamentos-helpers";

function gerarUuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const auth = await requireAuth(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }
  if (!hasRole(auth.session, "gestor")) {
    return res.status(403).json({ ok: false, error: "Apenas gestor/admin" });
  }

  const { viaturaId } = req.body || {};
  if (!viaturaId) {
    return res.status(400).json({ ok: false, error: "viaturaId obrigatorio" });
  }

  const user = await getUserById(auth.session.userId);
  if (!user) return res.status(404).json({ ok: false, error: "Usuario nao encontrado" });

  const vRes = await sql`SELECT * FROM viaturas WHERE id = ${viaturaId} LIMIT 1`;
  const viatura = vRes.rows[0];
  if (!viatura) return res.status(404).json({ ok: false, error: "Viatura nao encontrada" });

  // RLS
  if (user.viaturasRole === "gestor") {
    const unidadesAutorizadas = await getUserUnidadesAutorizadas(parseArr(user.unidadesGestor));
    if (!viatura.opm || !unidadesAutorizadas.includes(viatura.opm)) {
      return res.status(403).json({ ok: false, error: "Sem permissao para esta viatura" });
    }
  }

  // Reusa link existente
  if (viatura.linkRonda) {
    return res.status(200).json({ ok: true, linkRonda: viatura.linkRonda, jaExistia: true });
  }

  // Gera novo
  const linkRonda = gerarUuid();
  await sql`UPDATE viaturas SET linkRonda=${linkRonda}, atualizadoEm=${now()} WHERE id=${viaturaId}`;
  return res.status(200).json({ ok: true, linkRonda, jaExistia: false });
}

function parseArr(val: any): number[] {
  if (Array.isArray(val)) return val;
  if (typeof val === "string") { try { return JSON.parse(val); } catch { return []; } }
  return [];
}
