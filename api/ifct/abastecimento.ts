// ============================================================
// POST /api/ifct/abastecimento
// PUBLIC (token no body) - motorista registra um abastecimento
// durante a missao. Pode ter varios por IFCT.
// Foto do comprovante vai em base64 no campo fotoComprovante (TEXT).
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql, now } from "../_lib/db";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const { token, dataHora, natureza, quantidadeLitros, odometro, posto, fotoComprovante, observacao } = req.body || {};

  if (!token) {
    return res.status(400).json({ ok: false, error: "token obrigatorio" });
  }
  if (!natureza) {
    return res.status(400).json({ ok: false, error: "natureza (Gasolina/Alcool/Diesel/Oleo) eh obrigatoria" });
  }
  if (typeof quantidadeLitros !== "number" || quantidadeLitros <= 0) {
    return res.status(400).json({ ok: false, error: "quantidadeLitros deve ser > 0" });
  }
  if (typeof odometro !== "number" || odometro < 0) {
    return res.status(400).json({ ok: false, error: "odometro deve ser >= 0" });
  }

  // Valida token
  const agRes = await sql`SELECT id, ifctStatus FROM agendamentos WHERE linkIfct = ${token} LIMIT 1`;
  const ag = agRes.rows[0];
  if (!ag) return res.status(404).json({ ok: false, error: "Link IFCT invalido" });
  if (ag.ifctStatus === "validado") {
    return res.status(400).json({ ok: false, error: "IFCT ja foi validado pelo gestor" });
  }

  const ts = dataHora || now();

  const r = await sql`
    INSERT INTO ifctAbastecimentos (
      agendamentoId, dataHora, natureza, quantidadeLitros, odometro,
      posto, fotoComprovante, observacao, criadoEm
    ) VALUES (
      ${ag.id}, ${ts}, ${natureza}, ${quantidadeLitros}, ${odometro},
      ${posto || null}, ${fotoComprovante || null}, ${observacao || null}, ${ts}
    )
  `;
  const idRes = await sql`SELECT last_insert_rowid() as id`;
  const newId = (idRes.rows[0] as any)?.id;

  return res.status(200).json({ ok: true, id: newId });
}
