// ============================================================
// GET /api/ifct/pdf?token=UUID
// PUBLIC (sem auth, usa token IFCT) - gera o PDF do ICT
//
// FIX (William 2026-09-20): trocar pdfkit (binario nativo) por pdf-lib
// (puro JS) pra funcionar em Vercel Serverless. Layout razoavelmente
// parecido com o anterior (que usava pdfkit), sem renderizacao de SVG
// das assinaturas do celular (PDF fica com placeholder "[Assinatura
// gravada pelo app]").
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { sql } from "../lib/db";

// Resolve o caminho do brasão. Tenta várias estratégias.
function resolveBrasaoPath(): string | null {
  const candidates: string[] = [];
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    candidates.push(resolve(here, "..", "_lib", "brasao.jpg"));
  } catch {}
  candidates.push(resolve(process.cwd(), "api", "_lib", "brasao.jpg"));
  candidates.push(resolve(process.cwd(), "api\\_lib\\brasao.jpg"));
  candidates.push(resolve(process.cwd(), "internal", "..", "_lib", "brasao.jpg"));
  for (const c of candidates) {
    if (existsSync(c)) {
      console.log(`[pdf] brasao encontrado em: ${c}`);
      return c;
    }
  }
  console.log(`[pdf] brasao NAO encontrado em nenhum caminho`);
  return null;
}

const BRASAO_PATH = resolveBrasaoPath();
let brasaoBytes: Uint8Array | null = null;
if (BRASAO_PATH) {
  try {
    const buf = readFileSync(BRASAO_PATH);
    brasaoBytes = new Uint8Array(buf);
    console.log(`[pdf] brasao carregado: ${brasaoBytes.length} bytes`);
  } catch (e: any) {
    console.log(`[pdf] erro ao ler brasao: ${e.message}`);
  }
}

// Cor preta / cores auxiliares
const BLACK = rgb(0, 0, 0);
const BLUE_DARK = rgb(0.1, 0.14, 0.49);
const GRAY_LIGHT = rgb(0.96, 0.97, 0.98);
const GRAY_MED = rgb(0.81, 0.85, 0.86);
const GRAY_TEXT = rgb(0.27, 0.27, 0.27);
const GRAY_DARK = rgb(0.4, 0.4, 0.4);
const YELLOW_BG = rgb(1, 0.95, 0.8);
const BLUE_HEADER = rgb(0.89, 0.95, 0.99);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const token = (req.query.token as string) || "";
  if (!token) {
    return res.status(400).json({ ok: false, error: "token obrigatorio" });
  }

  // ============================================================
  // Busca todos os dados (mesma logica do pdfkit original)
  // ============================================================
  const agRes = await sql`SELECT * FROM agendamentos WHERE linkIfct = ${token} LIMIT 1`;
  const ag = agRes.rows[0];
  if (!ag) {
    return res.status(404).json({ ok: false, error: "Link IFCT invalido" });
  }

  const encRes = await sql`SELECT * FROM ifctEncerramentos WHERE agendamentoId = ${ag.id} LIMIT 1`;
  const encerramento = encRes.rows[0] || null;

  const absRes = await sql`
    SELECT * FROM ifctAbastecimentos
    WHERE agendamentoId = ${ag.id}
    ORDER BY dataHora ASC
  `;
  const abastecimentos = absRes.rows;

  const rondasRes = await sql`
    SELECT * FROM rondas
    WHERE agendamentoId = ${ag.id}
    ORDER BY preenchidoEm ASC
  `;
  const rondas = rondasRes.rows;

  let viatura: any = null;
  if (ag.viaturaAtribuida) {
    const vRes = await sql`SELECT * FROM viaturas WHERE id = ${ag.viaturaAtribuida}`;
    viatura = vRes.rows[0] || null;
  }
  let unidadeRequerente: any = null;
  if (ag.unidadeRequerente) {
    const uRes = await sql`SELECT * FROM units WHERE id = ${ag.unidadeRequerente}`;
    unidadeRequerente = uRes.rows[0] || null;
  }
  let unidadeOrigem: any = null;
  if (ag.unidadeOrigem) {
    const uRes = await sql`SELECT * FROM units WHERE id = ${ag.unidadeOrigem}`;
    unidadeOrigem = uRes.rows[0] || null;
  }
  let expedidor: any = null;
  if (ag.concluidoPor) {
    const uRes = await sql`SELECT * FROM users WHERE id = ${ag.concluidoPor}`;
    expedidor = uRes.rows[0] || null;
  } else if (ag.aprovadoPor) {
    const uRes = await sql`SELECT * FROM users WHERE id = ${ag.aprovadoPor}`;
    expedidor = uRes.rows[0] || null;
  }

  // ============================================================
  // Cria o PDF usando pdf-lib (puro JS, funciona em serverless)
  // ============================================================
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(`ICT-2026-${String(ag.id).padStart(3, "0")}`);
  pdfDoc.setAuthor("Sistema de Viaturas CPI-7");
  pdfDoc.setSubject("Informe de Controle de Trafego");

  const fontReg = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
  const fontMono = await pdfDoc.embedFont(StandardFonts.Courier);

  let brasaoImage: any = null;
  if (brasaoBytes) {
    try {
      brasaoImage = await pdfDoc.embedJpg(brasaoBytes);
    } catch (e: any) {
      console.log(`[pdf] erro ao embedar brasao: ${e.message}`);
    }
  }

  // ============================================================
  // Helpers locais (adaptados pra pdf-lib)
  // ============================================================
  const A4_W = 595;
  const A4_H = 842;
  const M = 36; // margin
  const CONTENT_W = A4_W - 2 * M; // 523 pt

  // FIX: Partida = horario em que o motorista CONFIRMOU o KM inicial
  const tsPartida = encerramento?.partidaConfirmadaEm ?? ag.retiradaData ?? null;
  const dataPartida = tsPartida ? formatDateTime(tsPartida) : "—";
  const tsRetorno = encerramento?.dataHora ?? ag.concluidoEm ?? ag.devolucaoData ?? null;
  const dataRetorno = tsRetorno ? formatDateTime(tsRetorno) : "—";

  const condutorTexto = [
    ag.motoristaPosto || ag.postoGraduacao || "",
    ag.motoristaNome || ag.warName || ag.nomeGuerra || "",
    ag.motoristaRe ? `RE ${ag.motoristaRe}` : "",
  ]
    .filter(Boolean)
    .join(" ")
    .trim() || "—";

  const partidaKm = encerramento?.hodometroPartida ?? ag.odometroRetirada ?? null;
  const retornoKm = encerramento?.hodometroRetorno ?? ag.odometroDevolucao ?? null;
  const diferencaKm = encerramento?.hodometroDiferenca
    ?? ag.kmRodados
    ?? (partidaKm != null && retornoKm != null
          ? Number(retornoKm) - Number(partidaKm)
          : null);

  const prefixoViatura: string | null = viatura?.prefixo ?? null;
  let tipoViatura = "—";
  let grupoViatura = "—";
  if (prefixoViatura) {
    grupoViatura = prefixoViatura;
    if (prefixoViatura.startsWith("I")) {
      tipoViatura = prefixoViatura;
    } else {
      tipoViatura = prefixoViatura.split("-")[0] || prefixoViatura;
    }
  }

  // ============================================================
  // PAGE 1 - FRENTE
  // ============================================================
  const page1 = pdfDoc.addPage([A4_W, A4_H]);
  let y = M;

  // (A) Bloco: BRASAO + SECRETARIA/SUBFROTA + PARTIDA/RETORNO
  const blocoTopH = 56;
  // Brasao
  page1.drawRectangle({ x: M, y: A4_H - M - blocoTopH, width: 56, height: blocoTopH, borderColor: BLACK, borderWidth: 0.5 });
  if (brasaoImage) {
    page1.drawImage(brasaoImage, { x: M + 1, y: A4_H - M - blocoTopH + 1, width: 54, height: 54 });
  } else {
    // Fallback: brasão desenhado
    page1.drawRectangle({ x: M, y: A4_H - M - blocoTopH, width: 56, height: blocoTopH, color: rgb(0.1, 0.14, 0.49), borderColor: BLACK, borderWidth: 0.5 });
    page1.drawText("PM", { x: M, y: A4_H - M - blocoTopH + 18, size: 14, font: fontBold, color: rgb(1, 1, 1) });
  }

  // Secretaria / Subfrota / Cidade
  const secX = M + 56 + 4;
  const secW = CONTENT_W - 56 - 4 - 140;
  page1.drawRectangle({ x: secX, y: A4_H - M - blocoTopH, width: secW, height: blocoTopH, borderColor: BLACK, borderWidth: 0.5 });

  page1.drawText("Secretaria da Seguranca Publica", {
    x: secX + 4, y: A4_H - M - 10, size: 9.5, font: fontReg, color: BLACK,
  });
  page1.drawText(`Subfrota ${unidadeRequerente?.sigla || unidadeRequerente?.name || "CPI-7"}`, {
    x: secX + 4, y: A4_H - M - 30, size: 11, font: fontBold, color: BLACK,
  });
  page1.drawText(unidadeOrigem?.cidade || unidadeOrigem?.municipio || "Sorocaba", {
    x: secX + 4, y: A4_H - M - 50, size: 10, font: fontReg, color: BLACK,
  });
  // Separadores
  page1.drawLine({
    start: { x: secX, y: A4_H - M - 22 },
    end: { x: secX + secW, y: A4_H - M - 22 },
    thickness: 0.5, color: BLACK,
  });
  page1.drawLine({
    start: { x: secX, y: A4_H - M - 42 },
    end: { x: secX + secW, y: A4_H - M - 42 },
    thickness: 0.5, color: BLACK,
  });

  // Partida / Retorno
  const prX = secX + secW + 4;
  const prW = 136;
  page1.drawRectangle({ x: prX, y: A4_H - M - blocoTopH, width: prW, height: blocoTopH, borderColor: BLACK, borderWidth: 0.5 });
  page1.drawText("Partida (data e hora)", { x: prX + 4, y: A4_H - M - 10, size: 8.5, font: fontReg });
  page1.drawText(dataPartida, { x: prX + 4, y: A4_H - M - 23, size: 9.5, font: fontBold });
  page1.drawLine({
    start: { x: prX, y: A4_H - M - 31 },
    end: { x: prX + prW, y: A4_H - M - 31 },
    thickness: 0.5, color: BLACK,
  });
  page1.drawText("Retorno (data e hora)", { x: prX + 4, y: A4_H - M - 38, size: 8.5, font: fontReg });
  page1.drawText(dataRetorno, { x: prX + 4, y: A4_H - M - 51, size: 9.5, font: fontBold });

  y += blocoTopH + 8;

  // (C) Nº CONTROLE + DECRETO
  page1.drawText("Nº Controle de Trafego", {
    x: M, y: A4_H - y - 8, size: 9, font: fontReg,
  });
  page1.drawText(`ICT-2026-${String(ag.id).padStart(3, "0")}`, {
    x: M + 115, y: A4_H - y - 8, size: 11, font: fontBold, color: BLUE_DARK,
  });
  page1.drawText("(Decreto no 979, de 23-1-1973)", {
    x: A4_W - M - 110, y: A4_H - y - 8, size: 7.5, font: fontItalic, color: GRAY_TEXT,
  });
  y += 14;
  // Linha divisora
  page1.drawLine({ start: { x: M, y: A4_H - y }, end: { x: A4_W - M, y: A4_H - y }, thickness: 0.5, color: BLACK });
  y += 4;

  // (D) Tabela PLACA | PATRIMONIO | TIPO | GRUPO
  const colW = CONTENT_W / 4;
  const tblHdrH = 16;
  const tblBodyH = 22;
  const tblY = y;
  // Header
  page1.drawRectangle({ x: M, y: A4_H - tblY - tblHdrH, width: CONTENT_W, height: tblHdrH, color: GRAY_MED, borderColor: BLACK, borderWidth: 0.5 });
  drawCellText(page1, fontBold, "PLACA", M, A4_H - tblY - tblHdrH + 5, colW);
  drawCellText(page1, fontBold, "PATRIMONIO", M + colW, A4_H - tblY - tblHdrH + 5, colW);
  drawCellText(page1, fontBold, "TIPO", M + colW * 2, A4_H - tblY - tblHdrH + 5, colW);
  drawCellText(page1, fontBold, "GRUPO", M + colW * 3, A4_H - tblY - tblHdrH + 5, colW);
  // Body
  page1.drawRectangle({ x: M, y: A4_H - tblY - tblHdrH - tblBodyH, width: CONTENT_W, height: tblBodyH, borderColor: BLACK, borderWidth: 0.5 });
  // Linhas verticais
  for (let i = 1; i < 4; i++) {
    page1.drawLine({
      start: { x: M + colW * i, y: A4_H - tblY - tblHdrH },
      end: { x: M + colW * i, y: A4_H - tblY - tblHdrH - tblBodyH },
      thickness: 0.5, color: BLACK,
    });
  }
  drawCellText(page1, fontBold, viatura?.placa || "—", M, A4_H - tblY - tblHdrH - tblBodyH + 6, colW, 11);
  drawCellText(page1, fontBold, viatura?.patrimonio || "—", M + colW, A4_H - tblY - tblHdrH - tblBodyH + 6, colW, 11);
  drawCellText(page1, fontBold, tipoViatura, M + colW * 2, A4_H - tblY - tblHdrH - tblBodyH + 6, colW, 11);
  drawCellText(page1, fontBold, grupoViatura, M + colW * 3, A4_H - tblY - tblHdrH - tblBodyH + 6, colW, 11);
  y = tblY + tblHdrH + tblBodyH + 6;

  // (E) CONDUTOR
  drawLabelAndField(page1, fontReg, fontBold, M, A4_H, y, CONTENT_W, "Condutor", 14, 18, condutorTexto, { bold: true, fontSize: 11 });
  y += 14 + 18 + 4;

  // (F) DESTINO E FINALIDADE
  drawLabelAndField(page1, fontReg, fontReg, M, A4_H, y, CONTENT_W, "Destino e Finalidade da Missao", 14, 28, ag.destino || "—");
  y += 14 + 28 + 4;

  // (G) FINALIDADE (RESUMO)
  drawLabelAndField(page1, fontReg, fontReg, M, A4_H, y, CONTENT_W, "Finalidade (resumo)", 14, 24, ag.finalidade || "—");
  y += 14 + 24 + 4;

  // (H) APRESENTAR-SE EM
  const aprHora = ag.horarioApresentacao || ag.retiradaHora || "—";
  const aprText = `${formatDate(ag.dataMissao) || "—"} as ${aprHora} horas`;
  drawLabelAndField(page1, fontReg, fontReg, M, A4_H, y, CONTENT_W, "Apresentar-se em", 14, 18, aprText);
  y += 14 + 18 + 6;

  // (I) Tabela odometro + abastecimento
  const metW = (CONTENT_W - 14) / 2;
  const metH = 100;
  const metY = y;

  // Label vertical esquerda "Quilometragem"
  page1.drawRectangle({ x: M, y: A4_H - metY - metH, width: 14, height: metH, borderColor: BLACK, borderWidth: 0.5 });
  drawRotatedText(page1, fontBold, "Quilometragem", M + 7, A4_H - metY - metH / 2 + 25, 8, GRAY_DARK);

  // Header Hodometro
  const odoX = M + 14;
  const odoW = metW - 14;
  page1.drawRectangle({ x: odoX, y: A4_H - metY - 14, width: odoW, height: 14, color: GRAY_MED, borderColor: BLACK, borderWidth: 0.5 });
  drawCellText(page1, fontBold, "HODOMETRO", odoX, A4_H - metY - 11, odoW, 8.5);

  // Corpo Hodometro (3 linhas)
  page1.drawRectangle({ x: odoX, y: A4_H - metY - metH, width: odoW, height: metH - 14, borderColor: BLACK, borderWidth: 0.5 });
  const odoRowH = (metH - 14) / 3;
  // Partida
  drawOdoLine(page1, odoX, A4_H - metY - 14 - odoRowH, odoW, odoRowH, "Partida", partidaKm, fontBold);
  // Retorno
  drawOdoLine(page1, odoX, A4_H - metY - 14 - odoRowH * 2, odoW, odoRowH, "Retorno", retornoKm, fontBold);
  // Diferenca (DESTAQUE)
  drawOdoLine(page1, odoX, A4_H - metY - 14 - odoRowH * 3, odoW, odoRowH, "Diferenca", diferencaKm, fontBold, true);

  // Label vertical "Abastecimento" entre as duas
  page1.drawRectangle({ x: odoX + odoW, y: A4_H - metY - metH, width: 14, height: metH, borderColor: BLACK, borderWidth: 0.5 });
  drawRotatedText(page1, fontBold, "Abastecimento", odoX + odoW + 7, A4_H - metY - metH / 2 + 40, 8, GRAY_DARK);

  // Tabela Abastecimento
  const absX = odoX + odoW + 14;
  page1.drawRectangle({ x: absX, y: A4_H - metY - 14, width: metW, height: 14, color: GRAY_MED, borderColor: BLACK, borderWidth: 0.5 });
  drawCellText(page1, fontBold, "ABASTECIMENTO", absX, A4_H - metY - 11, metW, 8.5);
  // Sub-header
  const subH = 14;
  const subNatW = metW * 0.36;
  const subQtdW = metW * 0.30;
  const subKmW = metW - subNatW - subQtdW;
  page1.drawRectangle({ x: absX, y: A4_H - metY - 14 - subH, width: metW, height: subH, borderColor: BLACK, borderWidth: 0.5 });
  page1.drawLine({ start: { x: absX + subNatW, y: A4_H - metY - 14 }, end: { x: absX + subNatW, y: A4_H - metY - 14 - subH }, thickness: 0.5 });
  page1.drawLine({ start: { x: absX + subNatW + subQtdW, y: A4_H - metY - 14 }, end: { x: absX + subNatW + subQtdW, y: A4_H - metY - 14 - subH }, thickness: 0.5 });
  drawCellText(page1, fontReg, "Natureza", absX, A4_H - metY - 14 - subH + 4, subNatW, 8.5);
  drawCellText(page1, fontReg, "Quantidade", absX + subNatW, A4_H - metY - 14 - subH + 4, subQtdW, 8.5, { align: "right", dx: -4 });
  drawCellText(page1, fontReg, "KM", absX + subNatW + subQtdW, A4_H - metY - 14 - subH + 4, subKmW, 8.5, { align: "right", dx: -4 });
  // Linhas de natureza
  const naturezas = ["Gasolina", "Alcool", "Diesel", "Oleo"];
  const absRowH = (metH - 14 - subH) / 4;
  for (let i = 0; i < 4; i++) {
    const nat = naturezas[i];
    const ay = metY + 14 + subH + absRowH * i;
    page1.drawRectangle({ x: absX, y: A4_H - ay - absRowH, width: metW, height: absRowH, borderColor: BLACK, borderWidth: 0.5 });
    page1.drawLine({ start: { x: absX + subNatW, y: A4_H - ay }, end: { x: absX + subNatW, y: A4_H - ay - absRowH }, thickness: 0.5 });
    page1.drawLine({ start: { x: absX + subNatW + subQtdW, y: A4_H - ay }, end: { x: absX + subNatW + subQtdW, y: A4_H - ay - absRowH }, thickness: 0.5 });
    const norm = (s: string) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const abs = (abastecimentos as any[]).find(a => norm(a.natureza) === norm(nat));
    drawCellText(page1, fontReg, nat, absX, A4_H - ay - absRowH / 2 - 4, subNatW, 9);
    drawCellText(page1, fontReg, abs ? `${abs.quantidadeLitros} L` : "—", absX + subNatW, A4_H - ay - absRowH / 2 - 4, subQtdW, 9, { align: "right", dx: -4 });
    drawCellText(page1, fontReg, abs ? formatNumber(abs.odometro) : "—", absX + subNatW + subQtdW, A4_H - ay - absRowH / 2 - 4, subKmW, 9, { align: "right", dx: -4 });
  }

  y = metY + metH + 6;

  // (J) EXPEDIDOR
  const expHdrH = 16;
  const expBoxH = 56;
  page1.drawRectangle({ x: M, y: A4_H - y - expHdrH, width: CONTENT_W, height: expHdrH, color: GRAY_MED, borderColor: BLACK, borderWidth: 0.5 });
  drawCellText(page1, fontBold, "EXPEDIDOR (gestor da subfrota que aprova o agendamento)", M, A4_H - y - expHdrH + 5, CONTENT_W, 8.5, { align: "center" });
  page1.drawRectangle({ x: M, y: A4_H - y - expHdrH - expBoxH, width: CONTENT_W, height: expBoxH, borderColor: BLACK, borderWidth: 0.5 });
  drawDigitalSignature(page1, brasaoImage, fontReg, fontBold, fontMono, M + 1, A4_H - y - expHdrH - expBoxH + 1, CONTENT_W - 2, expBoxH - 2, {
    posto: expedidor?.postoGraduacao || "Cb PM",
    nome: expedidor?.warName || expedidor?.name || "WILLIAM",
    re: expedidor?.re || "",
    digre: expedidor?.digre || "",
    timestamp: ag.concluidoEm || ag.aprovadoEm || Date.now(),
  });
  y += expHdrH + expBoxH + 6;
  // Nome do gestor
  const infoTxt = [
    expedidor?.postoGraduacao || "Cb PM",
    expedidor?.warName || expedidor?.name || "WILLIAM",
    expedidor?.re ? `RE ${expedidor.re}${expedidor.digre ? `-${expedidor.digre}` : ""}` : "",
  ].filter(Boolean).join(" ");
  page1.drawText(infoTxt, { x: M, y: A4_H - y - 10, size: 9, font: fontBold });
  y += 12;

  // "Baseado no Impresso..."
  page1.drawText("Baseado no Impresso Grafico do CSM/M Int", {
    x: A4_W - M - 200, y: A4_H - y - 8, size: 8, font: fontReg, color: GRAY_TEXT,
  });
  y += 12;
  page1.drawText(formatDateTime(ag.concluidoEm || ag.aprovadoEm), {
    x: A4_W - M - 200, y: A4_H - y - 6, size: 7.5, font: fontReg, color: GRAY_TEXT,
  });

  // Rodape
  page1.drawText("PM - L 9", { x: M, y: 8, size: 7, font: fontReg, color: GRAY_TEXT });

  // ============================================================
  // PAGE 2 - VERSO
  // ============================================================
  const page2 = pdfDoc.addPage([A4_W, A4_H]);
  let y2 = M;

  // (A) Titulo "O CONDUTOR PREENCHERA"
  page2.drawRectangle({ x: M, y: A4_H - y2 - 18, width: CONTENT_W, height: 18, color: BLUE_HEADER, borderColor: BLACK, borderWidth: 0.5 });
  drawCellText(page2, fontBold, "O CONDUTOR PREENCHERA", M, A4_H - y2 - 18 + 5, CONTENT_W, 11, { align: "center" });
  y2 += 24;

  // (B) Defeitos verificados
  const defeitosTexto = (encerramento?.defeitosVerificados
    && encerramento.defeitosVerificados.trim() !== ""
    && encerramento.defeitosVerificados.trim() !== "—")
    ? encerramento.defeitosVerificados
    : "A manutencao de 1o escalao foi realizada sem novidades";
  drawLabelAndField(page2, fontReg, fontReg, M, A4_H, y2, CONTENT_W,
    "O condutor anotara os defeitos verificados:", 12, 34, defeitosTexto);
  y2 += 12 + 34 + 4;

  // (C) Observacoes sobre multas/irregularidades/acidentes
  drawLabelAndField(page2, fontReg, fontReg, M, A4_H, y2, CONTENT_W,
    "O condutor fara observacoes sobre multas, irregularidades e acidentes:", 12, 34, encerramento?.observacoes || "—");
  y2 += 12 + 34 + 4;

  // (D) Nova apresentacao
  const temNova = !!encerramento?.novaApresentacaoData;
  page2.drawText("Nova Apresentacao?", { x: M, y: A4_H - y2 - 8, size: 9, font: fontReg });
  // Checkbox
  page2.drawRectangle({ x: M + 96, y: A4_H - y2 - 12, width: 11, height: 11, borderColor: BLACK, borderWidth: 0.5 });
  if (temNova) {
    // X dentro do checkbox
    page2.drawLine({ start: { x: M + 98, y: A4_H - y2 - 10 }, end: { x: M + 105, y: A4_H - y2 - 3 }, thickness: 1.5, color: BLACK });
    page2.drawLine({ start: { x: M + 105, y: A4_H - y2 - 10 }, end: { x: M + 98, y: A4_H - y2 - 3 }, thickness: 1.5, color: BLACK });
  }
  page2.drawText("Especificar para o caso de sim: dia - hora - local", {
    x: M + 115, y: A4_H - y2 - 8, size: 9, font: fontReg,
  });
  y2 += 16;

  if (temNova) {
    const fldH = 14;
    page2.drawRectangle({ x: M, y: A4_H - y2 - fldH, width: CONTENT_W, height: fldH, color: GRAY_LIGHT, borderColor: BLACK, borderWidth: 0.5 });
    const aprTxt = [
      formatDate(encerramento.novaApresentacaoData),
      encerramento.novaApresentacaoHora ? `as ${encerramento.novaApresentacaoHora}` : "",
      encerramento.novaApresentacaoLocal ? `- ${encerramento.novaApresentacaoLocal}` : "",
    ].filter(Boolean).join(" ");
    page2.drawText(aprTxt, { x: M + 4, y: A4_H - y2 - fldH + 4, size: 9, font: fontReg });
    y2 += fldH + 4;
  } else {
    y2 += 4;
  }

  // (E) Consideracoes gerais
  drawLabelAndField(page2, fontReg, fontReg, M, A4_H, y2, CONTENT_W,
    "Consideracoes gerais sobre o veiculo / condutor: e/ou", 12, 30, encerramento?.consideracoesVeiculo || "—");
  y2 += 12 + 30 + 4;

  // (F) Assinatura do CONDUTOR
  const condAssLabelH = 14;
  const condAssBoxH = 56;
  page2.drawRectangle({ x: M, y: A4_H - y2 - condAssLabelH, width: CONTENT_W, height: condAssLabelH, color: GRAY_MED, borderColor: BLACK, borderWidth: 0.5 });
  drawCellText(page2, fontBold, "CONDUTOR", M, A4_H - y2 - condAssLabelH + 4, CONTENT_W, 8.5, { align: "center" });
  page2.drawRectangle({ x: M, y: A4_H - y2 - condAssLabelH - condAssBoxH, width: CONTENT_W, height: condAssBoxH, borderColor: BLACK, borderWidth: 0.5 });
  drawDigitalSignature(page2, brasaoImage, fontReg, fontBold, fontMono, M + 1, A4_H - y2 - condAssLabelH - condAssBoxH + 1, CONTENT_W - 2, condAssBoxH - 2, {
    posto: ag.motoristaPosto || ag.postoGraduacao || "",
    nome: ag.motoristaNome || ag.warName || ag.nomeGuerra || "",
    re: ag.motoristaRe || "",
    digre: ag.motoristaDigre || "",
    timestamp: encerramento?.dataHora || ag.concluidoEm || Date.now(),
  });
  y2 += condAssLabelH + condAssBoxH + 4;
  // Nome do condutor
  page2.drawText(condutorTexto, {
    x: M, y: A4_H - y2 - 12, size: 10, font: fontBold, color: BLACK,
  });
  y2 += 16;

  // (G) RONDA
  const blocoRondaH = 18;
  page2.drawRectangle({ x: M, y: A4_H - y2 - blocoRondaH, width: CONTENT_W, height: blocoRondaH, color: rgb(0.73, 0.87, 0.98), borderColor: rgb(0.1, 0.47, 0.82), borderWidth: 0.8 });
  drawCellText(page2, fontBold, "RONDA", M, A4_H - y2 - blocoRondaH + 5, CONTENT_W, 11, { align: "center", color: rgb(0.05, 0.28, 0.63) });
  y2 += blocoRondaH + 4;

  const rondasParaMostrar = (rondas as any[]).length > 0 ? (rondas as any[]) : [null];

  for (let i = 0; i < rondasParaMostrar.length; i++) {
    const r = rondasParaMostrar[i];
    if (i > 0) {
      page2.drawLine({ start: { x: M, y: A4_H - y2 }, end: { x: A4_W - M, y: A4_H - y2 }, thickness: 0.5, color: BLACK });
      y2 += 4;
    }

    page2.drawText("Rondado por", { x: M, y: A4_H - y2 - 8, size: 9, font: fontReg });
    y2 += 12;
    page2.drawRectangle({ x: M, y: A4_H - y2 - 14, width: CONTENT_W, height: 14, color: GRAY_LIGHT, borderColor: BLACK, borderWidth: 0.5 });
    page2.drawText(r?.rondadoPor || "—", { x: M + 4, y: A4_H - y2 - 14 + 4, size: 10, font: fontReg });
    y2 += 18;

    page2.drawText("Texto Livre (descrever o que foi verificado / irregularidade encontrada):", {
      x: M, y: A4_H - y2 - 8, size: 9, font: fontReg,
    });
    y2 += 12;
    const tlH = 32;
    page2.drawRectangle({ x: M, y: A4_H - y2 - tlH, width: CONTENT_W, height: tlH, borderColor: BLACK, borderWidth: 0.5 });
    page2.drawText(r?.textoLivre || "—", { x: M + 4, y: A4_H - y2 - tlH + 4, size: 9, font: fontReg });
    y2 += tlH + 4;

    const col4W = (CONTENT_W - 12) / 4;
    page2.drawText("Posto", { x: M, y: A4_H - y2 - 8, size: 9, font: fontReg });
    page2.drawText("Nome de Guerra", { x: M + col4W + 4, y: A4_H - y2 - 8, size: 9, font: fontReg });
    page2.drawText("RE", { x: M + col4W * 2 + 8, y: A4_H - y2 - 8, size: 9, font: fontReg });
    page2.drawText("Unidade que pertence", { x: M + col4W * 3 + 12, y: A4_H - y2 - 8, size: 9, font: fontReg });
    y2 += 12;
    const col4H = 16;
    page2.drawRectangle({ x: M, y: A4_H - y2 - col4H, width: col4W, height: col4H, borderColor: BLACK, borderWidth: 0.5 });
    page2.drawRectangle({ x: M + col4W + 4, y: A4_H - y2 - col4H, width: col4W, height: col4H, borderColor: BLACK, borderWidth: 0.5 });
    page2.drawRectangle({ x: M + col4W * 2 + 8, y: A4_H - y2 - col4H, width: col4W, height: col4H, borderColor: BLACK, borderWidth: 0.5 });
    page2.drawRectangle({ x: M + col4W * 3 + 12, y: A4_H - y2 - col4H, width: col4W, height: col4H, borderColor: BLACK, borderWidth: 0.5 });
    const reTxt = r?.re ? `RE ${r.re}${r.digre ? `-${r.digre}` : ""}` : "—";
    page2.drawText(r?.posto || "—", { x: M + 2, y: A4_H - y2 - col4H + 5, size: 9, font: fontReg });
    page2.drawText(r?.nomeGuerra || "—", { x: M + col4W + 6, y: A4_H - y2 - col4H + 5, size: 9, font: fontReg });
    page2.drawText(reTxt, { x: M + col4W * 2 + 10, y: A4_H - y2 - col4H + 5, size: 9, font: fontReg });
    page2.drawText(r?.unidadePertence || "—", { x: M + col4W * 3 + 14, y: A4_H - y2 - col4H + 5, size: 9, font: fontReg });
    y2 += col4H + 6;

    // Assinatura do Rondante (placeholder)
    const asRondH = 30;
    page2.drawRectangle({ x: M, y: A4_H - y2 - asRondH, width: CONTENT_W, height: asRondH, borderColor: BLACK, borderWidth: 0.5 });
    if (r?.assinaturaSvg) {
      // Tem SVG mas nao renderizamos (substituido por placeholder texto)
      page2.drawText("[ Assinatura gravada pelo app - validada via token ]", {
        x: M + 4, y: A4_H - y2 - asRondH / 2 - 4, size: 9, font: fontItalic, color: GRAY_TEXT,
      });
    } else {
      page2.drawText("[ Area de desenho livre - assina com dedo no celular ]", {
        x: M + 4, y: A4_H - y2 - asRondH / 2 - 4, size: 9, font: fontItalic, color: GRAY_TEXT,
      });
    }
    y2 += asRondH + 6;
  }

  // ============================================================
  // PAGE 3 - COMPROVANTE(S) DE ABASTECIMENTO
  // ============================================================
  const absComFoto = (abastecimentos as any[]).filter(a => !!a.fotoComprovante);
  if (absComFoto.length > 0) {
    const page3 = pdfDoc.addPage([A4_W, A4_H]);
    let y3 = M;
    const compHdrH = 22;
    page3.drawRectangle({ x: M, y: A4_H - y3 - compHdrH, width: CONTENT_W, height: compHdrH, color: GRAY_MED, borderColor: BLACK, borderWidth: 0.5 });
    drawCellText(page3, fontBold, "COMPROVANTE(S) DE ABASTECIMENTO", M, A4_H - y3 - compHdrH + 6, CONTENT_W, 11, { align: "center" });
    y3 += compHdrH + 8;

    for (let i = 0; i < absComFoto.length; i++) {
      const a = absComFoto[i];
      const boxH = 14;
      page3.drawRectangle({ x: M, y: A4_H - y3 - boxH, width: CONTENT_W, height: boxH, color: GRAY_LIGHT, borderColor: BLACK, borderWidth: 0.5 });
      drawCellText(page3, fontBold, `Abastecimento ${i + 1} de ${absComFoto.length}`, M, A4_H - y3 - boxH + 3, CONTENT_W, 10);
      y3 += boxH;

      const dadosH = 30;
      page3.drawRectangle({ x: M, y: A4_H - y3 - dadosH, width: CONTENT_W, height: dadosH, borderColor: BLACK, borderWidth: 0.5 });
      const dataAb = a.dataHora ? formatDateTime(a.dataHora) : "—";
      const linhaDados = `Natureza: ${a.natureza}    -    Quantidade: ${a.quantidadeLitros} L    -    KM: ${formatNumber(a.odometro)}    -    Data: ${dataAb}`;
      page3.drawText(linhaDados, { x: M + 6, y: A4_H - y3 - dadosH + 8, size: 9, font: fontReg });
      if (a.posto) {
        page3.drawText(`Posto: ${a.posto}`, { x: M + 6, y: A4_H - y3 - dadosH + 22, size: 8, font: fontItalic, color: GRAY_TEXT });
      }
      y3 += dadosH;

      // Foto
      try {
        const fotoData = a.fotoComprovante as string;
        const m = fotoData.match(/^data:(image\/\w+);base64,(.+)$/);
        if (m) {
          const mime = m[1];
          const base64 = m[2];
          const buffer = Buffer.from(base64, "base64");
          const fotoW = CONTENT_W - 8;
          const fotoH = Math.min(220, A4_H - y3 - 30); // respeita espaco restante

          let embeddedImage: any;
          if (mime.includes("jpeg") || mime.includes("jpg")) {
            embeddedImage = await pdfDoc.embedJpg(buffer);
          } else if (mime.includes("png")) {
            embeddedImage = await pdfDoc.embedPng(buffer);
          }

          if (embeddedImage) {
            // Calcula aspect ratio
            const imgW = embeddedImage.width;
            const imgH = embeddedImage.height;
            const maxW = fotoW;
            const maxH = fotoH;
            let drawW = maxW;
            let drawH = maxH;
            if (imgW / imgH > maxW / maxH) {
              drawH = maxW * (imgH / imgW);
            } else {
              drawW = maxH * (imgW / imgH);
            }
            const drawX = M + (CONTENT_W - drawW) / 2;
            const drawY = A4_H - y3 - drawH;
            page3.drawImage(embeddedImage, { x: drawX, y: drawY, width: drawW, height: drawH });
            y3 += drawH + 16;
          }
        }
      } catch (e: any) {
        console.log(`[pdf] erro ao renderizar foto: ${e.message}`);
        page3.drawText("[ Erro ao carregar foto do comprovante ]", { x: M, y: A4_H - y3 - 14, size: 9, font: fontItalic, color: rgb(0.78, 0.16, 0.16) });
        y3 += 60;
      }
    }
  }

  // Finaliza PDF
  const pdfBytes = await pdfDoc.save();

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `inline; filename="ICT-2026-${String(ag.id).padStart(3, "0")}.pdf"`
  );
  res.setHeader("Content-Length", String(pdfBytes.length));

  return res.status(200).send(Buffer.from(pdfBytes));
}

// ============================================================
// Helpers (formato brasileiro)
// ============================================================
function formatDate(ts: number | string | null | undefined): string {
  if (ts === null || ts === undefined) return "—";
  const d = new Date(typeof ts === "string" ? parseInt(ts) : ts);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

function formatDateTime(ts: number | string | null | undefined): string {
  if (ts === null || ts === undefined) return "—";
  const d = new Date(typeof ts === "string" ? parseInt(ts) : ts);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR");
}

function formatNumber(n: number): string {
  if (n == null) return "—";
  return Number(n).toLocaleString("pt-BR");
}

// Desenha label em cima + retangulo com texto
function drawLabelAndField(
  page: any,
  fontReg: any, fontBold: any,
  x: number, pageH: number, y: number, w: number,
  label: string, labelH: number, fieldH: number,
  value: string,
  opts: { bold?: boolean; fontSize?: number } = {}
) {
  page.drawText(label, { x, y: pageH - y - 10, size: 9, font: fontBold });
  page.drawRectangle({ x, y: pageH - y - labelH - fieldH, width: w, height: fieldH, color: GRAY_LIGHT, borderColor: BLACK, borderWidth: 0.5 });
  page.drawText(value || "—", {
    x: x + 4, y: pageH - y - labelH - fieldH + 4, size: opts.fontSize || 10,
    font: opts.bold ? fontBold : fontReg,
  });
}

// Texto rotacionado 90 (label vertical)
function drawRotatedText(
  page: any,
  font: any, text: string,
  cx: number, cy: number, size: number, color: any
) {
  page.drawText(text, { x: cx, y: cy, size, font, color, rotate: { type: "degrees", angle: -90 } });
}

// Celula de tabela com texto
function drawCellText(
  page: any, font: any, text: string,
  x: number, y: number, w: number,
  size?: number,
  opts: { align?: "left" | "center" | "right"; dx?: number; color?: any; bold?: boolean } = {}
) {
  const fontSize = size || 9;
  const dx = opts.dx ?? 4;
  const align = opts.align || "left";
  page.drawText(text, { x: x + dx, y, size: fontSize, font, color: opts.color || BLACK });
}

// Linha da tabela Hodometro (Partida, Retorno, Diferenca)
function drawOdoLine(
  page: any, x: number, yTop: number, w: number, h: number,
  label: string, value: number | null, fontBold: any, destaque = false
) {
  page.drawLine({ start: { x, y: yTop }, end: { x: x + w, y: yTop }, thickness: 0.5, color: BLACK });
  if (destaque) {
    page.drawRectangle({ x: x + 1, y: yTop - h + 1, width: w - 2, height: h - 2, color: YELLOW_BG, borderColor: rgb(0.88, 0.66, 0), borderWidth: 0.5 });
  }
  page.drawText(label, { x: x + 4, y: yTop - h / 2 - 4, size: 9, font: fontBold });
  page.drawText(value != null ? `${formatNumber(value)} km` : "—", {
    x: x + 56, y: yTop - h / 2 - 4, size: 9, font: fontBold,
  });
}

// Assinatura Digital GERADA PELO SISTEMA (William v26)
function drawDigitalSignature(
  page: any, brasaoImage: any,
  fontReg: any, fontBold: any, fontMono: any,
  x: number, y: number, w: number, h: number,
  signatario: { posto?: string; nome?: string; re?: string; digre?: string; timestamp: number }
) {
  page.drawRectangle({ x, y, width: w, height: h, color: rgb(1, 0.99, 0.98), borderColor: rgb(0.53, 0.53, 0.53), borderWidth: 0.5 });

  const posto = (signatario.posto || "").trim();
  const nome = (signatario.nome || "").trim();
  const re = (signatario.re || "").trim();
  const digre = (signatario.digre || "").trim();
  const reFull = re ? `RE ${re}${digre ? `-${digre}` : ""}` : "";

  // Token SHA256
  const tokenInput = `${posto}|${nome}|${re}|${signatario.timestamp}|viatura-cpi7`;
  const hash = createHash("sha256").update(tokenInput).digest("hex").slice(0, 8).toUpperCase();

  // Brasao
  const brasaoW = Math.min(40, h - 8);
  if (brasaoImage) {
    page.drawImage(brasaoImage, { x: x + 4, y: y + h - brasaoW - 4, width: brasaoW, height: brasaoW });
  } else {
    page.drawRectangle({ x: x + 4, y: y + h - brasaoW - 4, width: brasaoW, height: brasaoW, color: BLUE_DARK });
  }

  // Label
  const txtX = x + brasaoW + 12;
  const txtW = w - brasaoW - 16;
  page.drawText("ASSINATURA DIGITAL", {
    x: txtX, y: y + h - 12, size: 7, font: fontBold, color: rgb(0.33, 0.33, 0.33),
  });

  // Linha tracejada
  const lineY = y + h * 0.55;
  for (let lx = txtX; lx < txtX + txtW; lx += 6) {
    page.drawLine({
      start: { x: lx, y: lineY },
      end: { x: lx + 3, y: lineY },
      thickness: 0.5, color: rgb(0.53, 0.53, 0.53),
    });
  }

  // Token (Times New Roman Italic Bold-like — usa HelveticaBoldOblique como similar)
  page.drawText(`Token: ${hash}`, {
    x: txtX, y: lineY - 6, size: 16, font: fontBold, color: BLUE_DARK,
  });

  // Info inferior
  page.drawText(`${reFull}    ${formatDateTime(signatario.timestamp)}`, {
    x: txtX, y: y + 4, size: 8, font: fontMono, color: rgb(0.27, 0.27, 0.27),
  });

  return hash;
}
