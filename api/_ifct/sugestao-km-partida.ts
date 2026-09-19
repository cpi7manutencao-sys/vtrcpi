// ============================================================
// GET /api/ifct/sugestao-km-partida?token=UUID
// PUBLIC (sem auth) - retorna o KM de partida sugerido pro motorista
// (ultimo KM registrado pra mesma viatura).
// Usado pra pre-preencher o input de hodometroPartida no IFCT mobile.
// O motorista confirma/edita antes de salvar.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "../_lib/db";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const token = (req.query.token as string) || "";
  if (!token) {
    return res.status(400).json({ ok: false, error: "token obrigatorio" });
  }

  // Pega viaturaId via linkIfct
  const agRes = await sql`SELECT viaturaAtribuida FROM agendamentos WHERE linkIfct = ${token} LIMIT 1`;
  const ag = agRes.rows[0];
  if (!ag || !ag.viaturaAtribuida) {
    return res.status(200).json({ ok: true, sugestao: null });
  }

  // Pega o ultimo KM de devolucao (concluido) pra essa viatura
  // OU o odometroRetirada (se ja preenchido) do proprio agendamento
  const ultRes = await sql`
    SELECT odometroRetirada, odometroDevolucao, status, id
    FROM agendamentos
    WHERE viaturaAtribuida = ${ag.viaturaAtribuida}
      AND id != (SELECT id FROM agendamentos WHERE linkIfct = ${token})
      AND (odometroRetirada IS NOT NULL OR odometroDevolucao IS NOT NULL)
    ORDER BY COALESCE(concluidoEm, criadoEm) DESC
    LIMIT 1
  `;
  const ult = ultRes.rows[0] as any;
  if (!ult) {
    return res.status(200).json({ ok: true, sugestao: null });
  }
  // Prioridade: odometroDevolucao (ultima devolucao) > odometroRetirada (ultima atribuida)
  const sugestao = typeof ult.odometroDevolucao === "number"
    ? ult.odometroDevolucao
    : ult.odometroRetirada;

  return res.status(200).json({ ok: true, sugestao });
}
