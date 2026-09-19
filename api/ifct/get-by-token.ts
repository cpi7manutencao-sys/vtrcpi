// ============================================================
// GET /api/ifct/get-by-token?token=UUID
// PUBLIC (sem auth) - usado pelo form mobile do motorista
// Busca agendamento pelo token IFCT.
// Clone de convex/ifct.ts:getByIfctToken
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql, now } from "../_lib/db";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const token = (req.query.token as string) || "";
  if (!token) {
    return res.status(400).json({ ok: false, error: "token obrigatorio" });
  }

  const agRes = await sql`SELECT * FROM agendamentos WHERE linkIfct = ${token} LIMIT 1`;
  const ag = agRes.rows[0];
  if (!ag) {
    return res.status(404).json({ ok: false, erro: "Link IFCT invalido" });
  }

  const agora = now();
  if (!ag.linkIfctExpiraEm || ag.linkIfctExpiraEm < agora) {
    return res.status(400).json({ ok: false, erro: "Link IFCT expirado" });
  }
  if (ag.ifctStatus === "validado") {
    return res.status(400).json({ ok: false, erro: "IFCT ja foi validado pelo gestor" });
  }

  // Busca dados relacionados
  let viatura = null;
  if (ag.viaturaAtribuida) {
    const vRes = await sql`SELECT id, prefixo, placa, patrimonio, tipo, categoria FROM viaturas WHERE id = ${ag.viaturaAtribuida}`;
    viatura = vRes.rows[0] || null;
  }
  let unidadeRequerente = null;
  if (ag.unidadeRequerente) {
    const uRes = await sql`SELECT id, name, sigla, code FROM units WHERE id = ${ag.unidadeRequerente}`;
    unidadeRequerente = uRes.rows[0] || null;
  }

  // FIX (William 2026-09-04): tambem retorna encerramento (se ja preenchido)
  const encRes = await sql`SELECT * FROM ifctEncerramentos WHERE agendamentoId = ${ag.id} LIMIT 1`;
  const encerramento = encRes.rows[0] || null;

  return res.status(200).json({
    ok: true,
    agendamento: {
      id: ag.id,
      dataMissao: ag.dataMissao,
      retiradaData: ag.retiradaData,
      retiradaHora: ag.retiradaHora,
      devolucaoData: ag.devolucaoData,
      devolucaoHora: ag.devolucaoHora,
      destino: ag.destino,
      finalidade: ag.finalidade,
      oficialAutorizador: ag.oficialAutorizador,
      postoGraduacao: ag.postoGraduacao,
      re: ag.re,
      nomeGuerra: ag.nomeGuerra,
      // Motorista (dados do SAT, se preenchido pelo gestor)
      motoristaPosto: ag.motoristaPosto,
      motoristaNome: ag.motoristaNome,
      motoristaRe: ag.motoristaRe,
      // OPM origem (do solicitante)
      unidadeOrigemId: ag.unidadeOrigem,
      // Odometros (preenchidos pelo gestor na atribuicao OU copiados do encerramento do IFCT)
      odometroRetirada: ag.odometroRetirada,
      odometroDevolucao: ag.odometroDevolucao,
      kmRodados: ag.kmRodados,
      // Status
      ifctStatus: ag.ifctStatus,
      ifctData: ag.ifctData,
      // Encerramento (se ja preenchido)
      encerramento: encerramento ? {
        dataHora: encerramento.dataHora,
        hodometroPartida: encerramento.hodometroPartida,
        hodometroRetorno: encerramento.hodometroRetorno,
        hodometroDiferenca: encerramento.hodometroDiferenca,
        defeitosVerificados: encerramento.defeitosVerificados,
        observacoes: encerramento.observacoes,
        novaApresentacaoData: encerramento.novaApresentacaoData,
        novaApresentacaoHora: encerramento.novaApresentacaoHora,
        novaApresentacaoLocal: encerramento.novaApresentacaoLocal,
        consideracoesVeiculo: encerramento.consideracoesVeiculo,
        temAssinatura: !!encerramento.assinaturaCondutorSvg,
      } : null,
      // Viatura + unidade
      viatura,
      unidadeRequerente,
    },
  });
}
