// ============================================================
// POST /api/ifct/encerramento
// PUBLIC (token no body) - motorista preenche o bloco
// "O CONDUTOR PREENCHERA" do IFCT apos a missao.
// Inclui assinatura digital do condutor (SVG).
// Marcado como UNIQUE por agendamentoId (soh 1 encerramento por IFCT).
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql, now } from "../_lib/db";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const { token, hodometroPartida, hodometroRetorno, defeitosVerificados, observacoes,
    novaApresentacaoData, novaApresentacaoHora, novaApresentacaoLocal,
    consideracoesVeiculo, assinaturaCondutorSvg,
  } = req.body || {};

  if (!token) {
    return res.status(400).json({ ok: false, error: "token obrigatorio" });
  }

  // Valida token
  const agRes = await sql`SELECT id, ifctStatus FROM agendamentos WHERE linkIfct = ${token} LIMIT 1`;
  const ag = agRes.rows[0];
  if (!ag) return res.status(404).json({ ok: false, error: "Link IFCT invalido" });
  if (ag.ifctStatus === "validado") {
    return res.status(400).json({ ok: false, error: "IFCT ja foi validado pelo gestor" });
  }

  // FIX (William 2026-09-07 v2): hodometroPartida + hodometroRetorno ambos pelo motorista
  let diferenca: number | null = null;
  if (typeof hodometroRetorno === "number" && typeof hodometroPartida === "number") {
    diferenca = hodometroRetorno - hodometroPartida;
    if (diferenca < 0) {
      return res.status(400).json({ ok: false, error: "Hodometro de retorno (" + hodometroRetorno + ") eh menor que o de partida (" + hodometroPartida + ")" });
    }
  }

  const ts = now();
  const ipOrigem = (req.headers["x-forwarded-for"] as string)?.split(",")[0] || req.socket?.remoteAddress || null;
  const userAgent = (req.headers["user-agent"] as string) || null;

  // FIX (William 2026-09-08 v24 PDF): partidaConfirmadaEm
  const encExistente = await sql`SELECT partidaConfirmadaEm FROM ifctEncerramentos WHERE agendamentoId = ${ag.id} LIMIT 1`;
  let partidaConfirmadaEm: number | null = encExistente.rows[0]?.partidaConfirmadaEm ?? null;
  if (typeof hodometroPartida === "number" && partidaConfirmadaEm == null) {
    partidaConfirmadaEm = ts;
  }

  // FIX (William 2026-09-14 v58): espelha partidaConfirmadaEm em agendamentos
  // pra que o frontend saiba que o motorista ja' comecou o ICT (sem precisar
  // fazer JOIN com ifctEncerramentos). Quando isso acontece, gestor NAO
  // pode mais cancelar (precisa excluir via admin).
  if (partidaConfirmadaEm != null) {
    await sql`UPDATE agendamentos SET partidaConfirmadaEm = COALESCE(partidaConfirmadaEm, ${partidaConfirmadaEm}), atualizadoEm = ${ts} WHERE id = ${ag.id}`;
  }

  // INSERT ou UPDATE (UNIQUE por agendamentoId)
  await sql`
    INSERT INTO ifctEncerramentos (
      agendamentoId, dataHora, hodometroPartida, hodometroRetorno, hodometroDiferenca,
      partidaConfirmadaEm,
      defeitosVerificados, observacoes,
      novaApresentacaoData, novaApresentacaoHora, novaApresentacaoLocal,
      consideracoesVeiculo, assinaturaCondutorSvg,
      ipOrigem, userAgentOrigem, criadoEm
    ) VALUES (
      ${ag.id}, ${ts}, ${typeof hodometroPartida === "number" ? hodometroPartida : null}, ${typeof hodometroRetorno === "number" ? hodometroRetorno : null}, ${diferenca},
      ${partidaConfirmadaEm},
      ${defeitosVerificados || null}, ${observacoes || null},
      ${novaApresentacaoData || null}, ${novaApresentacaoHora || null}, ${novaApresentacaoLocal || null},
      ${consideracoesVeiculo || null}, ${assinaturaCondutorSvg || null},
      ${ipOrigem}, ${userAgent}, ${ts}
    )
    ON CONFLICT(agendamentoId) DO UPDATE SET
      dataHora = excluded.dataHora,
      hodometroPartida = excluded.hodometroPartida,
      hodometroRetorno = excluded.hodometroRetorno,
      hodometroDiferenca = excluded.hodometroDiferenca,
      defeitosVerificados = excluded.defeitosVerificados,
      observacoes = excluded.observacoes,
      novaApresentacaoData = excluded.novaApresentacaoData,
      novaApresentacaoHora = excluded.novaApresentacaoHora,
      novaApresentacaoLocal = excluded.novaApresentacaoLocal,
      consideracoesVeiculo = excluded.consideracoesVeiculo,
      assinaturaCondutorSvg = excluded.assinaturaCondutorSvg,
      ipOrigem = excluded.ipOrigem,
      userAgentOrigem = excluded.userAgentOrigem
  `;

  return res.status(200).json({ ok: true, kmRodados: diferenca });
}
