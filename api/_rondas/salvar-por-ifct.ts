// ============================================================
// POST /api/rondas/salvar-por-ifct
// PUBLIC (sem auth) - salva ronda via link IFCT (diferente do QR
// Code da viatura). O token IFCT eh o linkIfct do agendamento.
// Resolve a viaturaId via agendamento.linkIfct.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql, now } from "../_lib/db";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const body = req.body || {};
  const { token, rondadoPor, textoLivre, posto, nomeGuerra, unidadePertence, assinaturaSvg, re, digre } = body;
  if (!token) {
    return res.status(400).json({ ok: false, error: "token (linkIfct) obrigatorio" });
  }
  if (!rondadoPor || !rondadoPor.trim()) {
    return res.status(400).json({ ok: false, error: "Nome de quem fez a ronda eh obrigatorio" });
  }
  if (!textoLivre || !textoLivre.trim()) {
    return res.status(400).json({ ok: false, error: "Texto livre eh obrigatorio" });
  }

  // Resolve agendamento pelo linkIfct
  const agRes = await sql`SELECT id, viaturaAtribuida, ifctStatus FROM agendamentos WHERE linkIfct = ${token} LIMIT 1`;
  const ag = agRes.rows[0];
  if (!ag) return res.status(404).json({ ok: false, error: "Link IFCT invalido" });
  if (!ag.viaturaAtribuida) return res.status(400).json({ ok: false, error: "Agendamento sem viatura atribuida" });
  if (ag.ifctStatus === "validado") return res.status(400).json({ ok: false, error: "IFCT ja foi validado" });

  const ipOrigem = (req.headers["x-forwarded-for"] as string)?.split(",")[0] || req.socket?.remoteAddress || null;
  const userAgent = (req.headers["user-agent"] as string) || null;

  const r = await sql`
    INSERT INTO rondas (viaturaId, agendamentoId, rondadoPor, textoLivre, posto, nomeGuerra, unidadePertence, assinaturaSvg, re, digre, preenchidoEm, ipOrigem, userAgentOrigem)
    VALUES (${ag.viaturaAtribuida}, ${ag.id}, ${rondadoPor.trim()}, ${textoLivre.trim()}, ${posto?.trim() || null}, ${nomeGuerra?.trim() || null}, ${unidadePertence?.trim() || null}, ${assinaturaSvg || null}, ${re?.trim() || null}, ${digre?.trim() || null}, ${now()}, ${ipOrigem}, ${userAgent})
  `;
  const idRes = await sql`SELECT last_insert_rowid() as id`;
  return res.status(200).json({ ok: true, rondaId: (idRes.rows[0] as any)?.id });
}
