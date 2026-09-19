// ============================================================
// GET /api/rondas/get-by-token?token=UUID
// PUBLIC (sem auth) - usado pelo form mobile do rondante
// Busca dados da viatura pelo link da ronda.
// Clone de convex/rondas.ts:getByRondaToken
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

  const vRes = await sql`SELECT * FROM viaturas WHERE linkRonda = ${token} LIMIT 1`;
  const viatura = vRes.rows[0];
  if (!viatura) return res.status(404).json({ ok: false, erro: "QR Code invalido" });

  let opm = null;
  if (viatura.opm) {
    const uRes = await sql`SELECT * FROM units WHERE id = ${viatura.opm}`;
    opm = uRes.rows[0] || null;
  }
  if (!opm) {
    return res.status(400).json({ ok: false, erro: "OPM da viatura nao encontrada" });
  }

  // Ultima ronda
  const ultimaRes = await sql`SELECT * FROM rondas WHERE viaturaId = ${viatura.id} ORDER BY preenchidoEm DESC LIMIT 1`;
  const ultimaRonda = ultimaRes.rows[0] || null;

  return res.status(200).json({
    ok: true,
    viatura: {
      id: viatura.id,
      prefixo: viatura.prefixo,
      placa: viatura.placa,
      patrimonio: viatura.patrimonio,
      marcaModelo: viatura.marcaModelo,
      tipo: viatura.tipo,
      ativo: viatura.ativo,
    },
    opm: {
      id: opm.id,
      name: opm.name,
      sigla: opm.sigla,
      code: opm.code,
    },
    ultimaRonda,
  });
}
