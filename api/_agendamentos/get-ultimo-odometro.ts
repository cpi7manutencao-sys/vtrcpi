// ============================================================
// GET /api/agendamentos/get-ultimo-odometro?viaturaId=
// Retorna o ultimo odometro conhecido de uma viatura.
// Sugere a KM de retirada no modal "Atribuir VTR".
// Prioriza devolucao > retirada.
// Clone de convex/agendamentos.ts:getUltimoOdometro
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "../_lib/db";
import { requireAuth } from "../_lib/auth";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const auth = await requireAuth(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }

  const viaturaId = parseInt((req.query.viaturaId as string) || "0", 10);
  if (!viaturaId) {
    return res.status(400).json({ ok: false, error: "viaturaId obrigatorio" });
  }

  // Pega todos os agendamentos dessa viatura com odometro
  const allRes = await sql`
    SELECT id, odometroRetirada, odometroRetiradaEm, odometroDevolucao, odometroDevolucaoEm
    FROM agendamentos
    WHERE viaturaAtribuida = ${viaturaId}
      AND (odometroRetirada IS NOT NULL OR odometroDevolucao IS NOT NULL)
  `;
  const rows = allRes.rows;

  if (rows.length === 0) {
    return res.status(200).json({ ultimoOdometro: null, agendamentoId: null, data: null, fonte: null });
  }

  // Prioriza o ultimo odometroDevolucao
  const comDevolucao = rows
    .filter((a: any) => a.odometroDevolucao != null)
    .sort((a: any, b: any) => (b.odometroDevolucaoEm || 0) - (a.odometroDevolucaoEm || 0));
  if (comDevolucao.length > 0) {
    const ultimo = comDevolucao[0];
    return {
      ultimoOdometro: ultimo.odometroDevolucao,
      agendamentoId: ultimo.id,
      data: ultimo.odometroDevolucaoEm,
      fonte: "devolucao",
    };
  }

  // Fallback: ultima retirada
  const comRetirada = rows
    .filter((a: any) => a.odometroRetirada != null)
    .sort((a: any, b: any) => (b.odometroRetiradaEm || 0) - (a.odometroRetiradaEm || 0));
  if (comRetirada.length > 0) {
    const ultimo = comRetirada[0];
    return {
      ultimoOdometro: ultimo.odometroRetirada,
      agendamentoId: ultimo.id,
      data: ultimo.odometroRetiradaEm,
      fonte: "retirada",
    };
  }

  return res.status(200).json({ ultimoOdometro: null, agendamentoId: null, data: null, fonte: null });
}
