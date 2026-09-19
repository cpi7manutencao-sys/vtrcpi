// ============================================================
// GET /api/ifct/listar-abastecimentos?token=UUID
// PUBLIC (token) - lista os abastecimentos de um IFCT
// Retorna array de abastecimentos (sem fotoComprovante pra
// nao pesar a resposta, mas o GET by id tem o full).
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

  const agRes = await sql`SELECT id FROM agendamentos WHERE linkIfct = ${token} LIMIT 1`;
  const ag = agRes.rows[0];
  if (!ag) return res.status(404).json({ ok: false, error: "Link IFCT invalido" });

  const r = await sql`
    SELECT id, dataHora, natureza, quantidadeLitros, odometro, posto, observacao, criadoEm
    FROM ifctAbastecimentos
    WHERE agendamentoId = ${ag.id}
    ORDER BY dataHora ASC
  `;

  return res.status(200).json({ ok: true, abastecimentos: r.rows });
}
