// ============================================================
// POST /api/ifct/salvar-motorista
// PUBLIC (sem auth) - usado pelo form mobile do motorista
// Salva IFCT preenchido pelo motorista.
// Clone de convex/ifct.ts:salvarIfctMotorista
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql, now } from "../_lib/db";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const { token, ifctData, ipOrigem, userAgentOrigem } = req.body || {};
  if (!token || !ifctData) {
    return res.status(400).json({ ok: false, error: "token e ifctData obrigatorios" });
  }

  const agRes = await sql`SELECT * FROM agendamentos WHERE linkIfct = ${token} LIMIT 1`;
  const ag = agRes.rows[0];
  if (!ag) return res.status(404).json({ ok: false, error: "Link IFCT invalido" });
  if (!ag.linkIfctExpiraEm || ag.linkIfctExpiraEm < now()) {
    return res.status(400).json({ ok: false, error: "Link IFCT expirado" });
  }
  if (ag.ifctStatus === "validado") {
    return res.status(400).json({ ok: false, error: "IFCT ja foi validado pelo gestor" });
  }

  // Calcula diferenca se nao veio
  let hodometroDiferenca = ifctData.hodometroDiferenca;
  if (
    hodometroDiferenca === undefined &&
    ifctData.hodometroPartida !== undefined &&
    ifctData.hodometroRetorno !== undefined
  ) {
    hodometroDiferenca = ifctData.hodometroRetorno - ifctData.hodometroPartida;
  }

  const agora = now();
  const fullData = {
    ...ifctData,
    hodometroDiferenca,
    preenchidoEm: agora,
    ipOrigem: ipOrigem || null,
    userAgentOrigem: userAgentOrigem || null,
  };

  await sql`UPDATE agendamentos
    SET ifctStatus = 'preenchido',
        ifctData = ${JSON.stringify(fullData)},
        odometroRetirada = ${ifctData.hodometroPartida ?? ag.odometroRetirada},
        odometroDevolucao = ${ifctData.hodometroRetorno ?? ag.odometroDevolucao},
        kmRodados = ${hodometroDiferenca ?? ag.kmRodados},
        atualizadoEm = ${agora}
    WHERE id = ${ag.id}`;

  return res.status(200).json({ ok: true, ifctStatus: "preenchido" });
}
