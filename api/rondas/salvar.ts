// ============================================================
// POST /api/rondas/salvar
// PUBLIC (sem auth) - usado pelo form mobile do rondante
// Salva ronda preenchida pelo rondante.
// Clone de convex/rondas.ts:salvarRonda
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql, now } from "../_lib/db";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const body = req.body || {};
  const { token, rondadoPor, textoLivre, posto, nomeGuerra, unidadePertence, assinaturaSvg, ipOrigem, userAgentOrigem } = body;
  if (!token) {
    return res.status(400).json({ ok: false, error: "token obrigatorio" });
  }
  if (!rondadoPor || !rondadoPor.trim()) {
    return res.status(400).json({ ok: false, error: "Nome de quem fez a ronda eh obrigatorio" });
  }

  const vRes = await sql`SELECT id FROM viaturas WHERE linkRonda = ${token} LIMIT 1`;
  if (!vRes.rows[0]) return res.status(404).json({ ok: false, error: "QR Code invalido" });

  const r = await sql`
    INSERT INTO rondas (viaturaId, rondadoPor, textoLivre, posto, nomeGuerra, unidadePertence, assinaturaSvg, preenchidoEm, ipOrigem, userAgentOrigem)
    VALUES (${vRes.rows[0].id}, ${rondadoPor.trim()}, ${textoLivre?.trim() || null}, ${posto?.trim() || null}, ${nomeGuerra?.trim() || null}, ${unidadePertence?.trim() || null}, ${assinaturaSvg || null}, ${now()}, ${ipOrigem || null}, ${userAgentOrigem || null})
  `;
  const idRes = await sql`SELECT last_insert_rowid() as id`;
  return res.status(200).json({ ok: true, rondaId: (idRes.rows[0] as any)?.id });
}
