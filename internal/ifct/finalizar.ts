// ============================================================
// POST /api/ifct/finalizar
// PUBLIC (token) - motorista finaliza o IFCT apos preencher
// todos os blocos (encerramento obrigatorio, abastecimento/ronda opcionais).
// Marca ifctStatus = 'preenchido' e seta ifctData (JSON com resumo).
// Apos isso, o gestor pode revisar e validar (ifctStatus = 'validado').
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql, query, now } from "../lib/db";

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
  // FIX (William 2026-09-20): converte undefined pra null explicitamente.
  // Caso contrario o pg manda "could not determine data type of parameter $N"
  // pq template literals JS transformam undefined em texto 'undefined' e o
  // driver pg nao sabe o tipo do parametro. Usamos `?? null` no FINAL
  // da cadeia pra garantir que NUNCA sai undefined.
  const safeNum = (v: any): number | null => (v == null ? null : Number(v));
  const hodometroPartida = safeNum(enc?.hodometroPartida ?? ag.odometroRetirada);
  const hodometroRetorno = safeNum(enc?.hodometroRetorno ?? ag.odometroDevolucao);
  const kmRodados = safeNum(enc?.hodometroDiferenca ?? ag.kmRodados);

  // FIX (William 2026-09-07): ronda nao eh mais obrigatoria nem contada aqui
  // (rondas sao registradas por QR no painel da viatura, via /api/rondas/salvar)
  // Salva resumo no ifctData (JSON)
  const ifctData = {
    finalizadoEm: now(),
    totalAbastecimentos,
  };

  const ts = now();
  // FIX (William 2026-09-20): use query() em vez de sql template tag,
  // porque pg em template tag tem dificuldade com parametros null/undefined
  // na clausula CASE WHEN. Vamos montar tudo explicitamente.
  // Usamos placeholders diferentes pra cada uso do mesmo parametro, senao
  // o pg reclama "inconsistent types deduced for parameter $N".
  const sqlFinal = `
    UPDATE agendamentos
    SET ifctStatus = $1,
        ifctData = $2,
        odometroRetirada = $3,
        odometroDevolucao = $4,
        odometroDevolucaoEm = $5,
        odometroRetiradaEm = CASE WHEN $6::bigint IS NOT NULL THEN COALESCE(odometroRetiradaEm, $7::bigint) ELSE odometroRetiradaEm END,
        kmRodados = $8,
        atualizadoEm = $9
    WHERE id = $10
  `;
  await query(sqlFinal, [
    'preenchido',                // $1 ifctStatus
    JSON.stringify(ifctData),    // $2 ifctData
    hodometroPartida,            // $3 odometroRetirada
    hodometroRetorno,            // $4 odometroDevolucao
    ts,                          // $5 odometroDevolucaoEm
    hodometroPartida,            // $6 (mesmo que $3, placeholder separado pro CASE WHEN)
    ts,                          // $7 (mesmo que $5, placeholder separado pro CASE WHEN)
    kmRodados,                   // $8 kmRodados
    ts,                          // $9 atualizadoEm
    ag.id,                       // $10 WHERE id
  ]);

  return res.status(200).json({ ok: true, totalAbastecimentos, kmRodados });
}
