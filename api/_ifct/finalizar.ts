// ============================================================
// POST /api/ifct/finalizar
// PUBLIC (token) - motorista finaliza o IFCT apos preencher
// todos os blocos (encerramento obrigatorio, abastecimento/ronda opcionais).
// Marca ifctStatus = 'preenchido' e seta ifctData (JSON com resumo).
// Apos isso, o gestor pode revisar e validar (ifctStatus = 'validado').
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql, now } from "../_lib/db";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const { token } = req.body || {};
  if (!token) {
    return res.status(400).json({ ok: false, error: "token obrigatorio" });
  }

  const agRes = await sql`SELECT * FROM agendamentos WHERE linkIfct = ${token} LIMIT 1`;
  const ag = agRes.rows[0];
  if (!ag) return res.status(404).json({ ok: false, error: "Link IFCT invalido" });
  if (ag.ifctStatus === "validado") {
    return res.status(400).json({ ok: false, error: "IFCT ja foi validado pelo gestor" });
  }
  if (ag.ifctStatus === "preenchido") {
    return res.status(400).json({ ok: false, error: "IFCT ja foi preenchido (aguarde o gestor validar)" });
  }

  // FIX (William 2026-09-07 v2): valida que o encerramento foi feito E pega hodometros
  // (precisa ser 1 query soh, nao 2)
  const encRes = await sql`SELECT id, hodometroPartida, hodometroRetorno, hodometroDiferenca FROM ifctEncerramentos WHERE agendamentoId = ${ag.id} LIMIT 1`;
  const enc = encRes.rows[0] || null;
  if (!enc) {
    return res.status(400).json({ ok: false, error: "Preencha o bloco de ENCERRAMENTO antes de finalizar" });
  }

  // Conta abastecimentos
  const absRes = await sql`SELECT COUNT(*) as c FROM ifctAbastecimentos WHERE agendamentoId = ${ag.id}`;
  const totalAbastecimentos = (absRes.rows[0] as any)?.c || 0;

  // FIX (William 2026-09-07 v2): copia odometros do encerramento pro agendamento
  // (motorista eh quem preenche, nao mais o gestor)
  const hodometroPartida = enc?.hodometroPartida ?? ag.odometroRetirada ?? null;
  const hodometroRetorno = enc?.hodometroRetorno ?? ag.odometroDevolucao ?? null;
  const kmRodados = enc?.hodometroDiferenca ?? ag.kmRodados ?? null;

  // FIX (William 2026-09-07): ronda nao eh mais obrigatoria nem contada aqui
  // (rondas sao registradas por QR no painel da viatura, via /api/rondas/salvar)
  // Salva resumo no ifctData (JSON)
  const ifctData = {
    finalizadoEm: now(),
    totalAbastecimentos,
  };

  const ts = now();
  await sql`
    UPDATE agendamentos
    SET ifctStatus = 'preenchido',
        ifctData = ${JSON.stringify(ifctData)},
        odometroRetirada = ${hodometroPartida},
        odometroDevolucao = ${hodometroRetorno},
        odometroDevolucaoEm = ${ts},
        odometroRetiradaEm = CASE WHEN ${hodometroPartida} IS NOT NULL THEN COALESCE(odometroRetiradaEm, ${ts}) ELSE odometroRetiradaEm END,
        kmRodados = ${kmRodados},
        atualizadoEm = ${ts}
    WHERE id = ${ag.id}
  `;

  return res.status(200).json({ ok: true, totalAbastecimentos, kmRodados });
}
