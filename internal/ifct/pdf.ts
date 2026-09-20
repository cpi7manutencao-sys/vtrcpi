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

// FIX (William 2026-09-20 v70): brasao embedado como base64 no codigo
// pra garantir que sempre funcione (readFileSync falha em Vercel por causa
// do cwd diferente). 8KB JPEG = 11KB base64.
const BRASAO_BASE64 = `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`;
;

// Decodifica pra bytes uma vez no startup
function getBrasaoBytes(): Uint8Array | null {
  try {
    const cleanBase64 = BRASAO_BASE64.replace(/[\r\n\s]/g, '');
    const buf = Buffer.from(cleanBase64, "base64");
    return new Uint8Array(buf);
  } catch (e) {
    console.log(`[pdf] erro ao decodificar brasao base64: ${(e as Error).message}`);
    return null;
  }
}
let brasaoBytes: Uint8Array | null = getBrasaoBytes();
if (brasaoBytes) {
  console.log(`[pdf] brasao embedado: ${brasaoBytes.length} bytes`);
}

// Resolve o caminho do brasão. Tenta várias estratégias.
function resolveBrasaoPath(): string | null {
  const candidates: string[] = [];
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    // FIX (William 2026-09-20 v70): tenta TODOS os caminhos comuns
    // (em runtime o dirname pode variar por causa do bundle esbuild)
    candidates.push(resolve(here, "..", "_lib", "brasao.jpg"));
    candidates.push(resolve(here, "..", "lib", "brasao.jpg"));
    candidates.push(resolve(here, "..", "..", "_lib", "brasao.jpg"));
    candidates.push(resolve(here, "..", "..", "lib", "brasao.jpg"));
    candidates.push(resolve(here, "..", "..", "..", "Brasao.jpg"));
    candidates.push(resolve(here, "..", "..", "..", "brasao.jpg"));
  } catch {}
  candidates.push(resolve(process.cwd(), "api", "_lib", "brasao.jpg"));
  candidates.push(resolve(process.cwd(), "internal", "_lib", "brasao.jpg"));
  candidates.push(resolve(process.cwd(), "internal", "lib", "brasao.jpg"));
  candidates.push(resolve(process.cwd(), "Brasao.jpg"));
  candidates.push(resolve(process.cwd(), "brasao.jpg"));
  candidates.push(resolve(process.cwd(), "..", "Brasao.jpg"));
  candidates.push("/var/task/Brasao.jpg");
  candidates.push("/var/task/internal/_lib/brasao.jpg");
  for (const c of candidates) {
    if (existsSync(c)) {
      console.log(`[pdf] brasao encontrado em: ${c}`);
      return c;
    }
  }
  console.log(`[pdf] brasao NAO encontrado em nenhum caminho:`);
  candidates.forEach((c) => console.log(`  - ${c}`));
  return null;
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

  // FIX (William 2026-09-20 v70): 3 linhas de altura, com folga pra nao
  // tocar as linhas separadoras. Cada linha ocupa ~1/3 do bloco.
  // Linha 1 (topo): "Secretaria da Seguranca Publica"
  // Linha 2 (meio): "Subfrota XXX"
  // Linha 3 (baixo): "Sorocaba"
  const linhaH = blocoTopH / 3;
  page1.drawText("Secretaria da Seguranca Publica", {
    x: secX + 4, y: A4_H - M - 14, size: 9.5, font: fontReg, color: BLACK,
  });
  page1.drawText(`Subfrota ${unidadeRequerente?.sigla || unidadeRequerente?.name || "CPI-7"}`, {
    x: secX + 4, y: A4_H - M - linhaH - 12, size: 11, font: fontBold, color: BLACK,
  });
  page1.drawText(unidadeOrigem?.cidade || unidadeOrigem?.municipio || "Sorocaba", {
    x: secX + 4, y: A4_H - M - linhaH * 2 - 12, size: 10, font: fontReg, color: BLACK,
  });
  // Separadores horizontais (entre as linhas)
  page1.drawLine({
    start: { x: secX, y: A4_H - M - linhaH },
    end: { x: secX + secW, y: A4_H - M - linhaH },
    thickness: 0.5, color: BLACK,
  });
  page1.drawLine({
    start: { x: secX, y: A4_H - M - linhaH * 2 },
    end: { x: secX + secW, y: A4_H - M - linhaH * 2 },
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
  // FIX (William 2026-09-20 v70): i=0 deve comecar no TOPO do box
  // (A4_H - metY - 14), nao - 14 - odoRowH (que pulava a primeira linha).
  // drawOdoLine desenha uma linha horizontal em yTop e o retangulo da
  // celula de yTop-h ate yTop. Entao a primeira linha precisa de yTop
  // igual ao topo do corpo (i=0), segunda linha subtrai 1*odoRowH (i=1), etc.
  // Partida (linha 1 - topo)
  drawOdoLine(page1, odoX, A4_H - metY - 14 - odoRowH * 0, odoW, odoRowH, "Partida", partidaKm, fontBold);
  // Retorno (linha 2 - meio)
  drawOdoLine(page1, odoX, A4_H - metY - 14 - odoRowH * 1, odoW, odoRowH, "Retorno", retornoKm, fontBold);
  // Diferenca (linha 3 - base, DESTAQUE amarelo)
  drawOdoLine(page1, odoX, A4_H - metY - 14 - odoRowH * 2, odoW, odoRowH, "Diferenca", diferencaKm, fontBold, true);

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
  drawCellText(page1, fontReg, "Quantidade", absX + subNatW, A4_H - metY - 14 - subH + 4, subQtdW, 8.5, { align: "right", dx: 4 });
  drawCellText(page1, fontReg, "KM", absX + subNatW + subQtdW, A4_H - metY - 14 - subH + 4, subKmW, 8.5, { align: "right", dx: 4 });
  // FIX (William 2026-09-20 v70): retangulo externo do box Abastecimento
  // (estava faltando - ficava solto em relacao ao Hodometro do lado)
  page1.drawRectangle({ x: absX, y: A4_H - metY - metH, width: metW, height: metH - 14, borderColor: BLACK, borderWidth: 0.5 });
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
    drawCellText(page1, fontReg, abs ? `${abs.quantidadeLitros} L` : "—", absX + subNatW, A4_H - ay - absRowH / 2 - 4, subQtdW, 9, { align: "right", dx: 4 });
    drawCellText(page1, fontReg, abs ? formatNumber(abs.odometro) : "—", absX + subNatW + subQtdW, A4_H - ay - absRowH / 2 - 4, subKmW, 9, { align: "right", dx: 4 });
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
  // FIX (William 2026-09-20 v71): infoTxt fica LOGO abaixo do box de
  // assinatura (4pt de gap), na MESMA COLUNA do "Baseado..." (coluna
  // direita), MESMO X, MAS ACIMA dele com folga clara de 18pt.
  y += expHdrH + expBoxH + 4;
  // Nome do gestor (IMEDIATAMENTE abaixo do box, mesma coluna do "Baseado...")
  const infoTxt = [
    expedidor?.postoGraduacao || "Cb PM",
    expedidor?.warName || expedidor?.name || "WILLIAM",
    expedidor?.re ? `RE ${expedidor.re}${expedidor.digre ? `-${expedidor.digre}` : ""}` : "",
  ].filter(Boolean).join(" ");
  page1.drawText(infoTxt, {
    x: A4_W - M - 200,
    y: A4_H - y - 9, size: 9, font: fontBold,
  });
  y += 18;

  // "Baseado no Impresso..." (mesmo X, mais abaixo com folga)
  page1.drawText("Baseado no Impresso Grafico do CSM/M Int", {
    x: A4_W - M - 200, y: A4_H - y - 6, size: 8, font: fontReg, color: GRAY_TEXT,
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
  // FIX (William 2026-09-20 v71): nome do condutor fica LOGO abaixo do
  // box de assinatura (3pt de gap), na coluna direita da pagina (mesmo
  // padrao do EXPEDIDOR).
  y2 += condAssLabelH + condAssBoxH + 3;
  // Nome do condutor (coluna direita, alinhado a esquerda)
  const condTxtWidth = fontBold.widthOfTextAtSize(condutorTexto, 10);
  page2.drawText(condutorTexto, {
    x: M + CONTENT_W - 200,
    y: A4_H - y2 - 10, size: 10, font: fontBold, color: BLACK,
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
  let drawX = x + dx;
  if (align === "right") {
    // FIX (William 2026-09-20 v71): medir o texto e alinhar pela direita
    // da celula. Antes o align era ignorado e o texto comecava em x+dx,
    // atravessando as linhas verticais entre colunas.
    const textWidth = font.widthOfTextAtSize(text, fontSize);
    drawX = x + w - textWidth - dx;
  } else if (align === "center") {
    const textWidth = font.widthOfTextAtSize(text, fontSize);
    drawX = x + (w - textWidth) / 2;
  }
  page.drawText(text, { x: drawX, y, size: fontSize, font, color: opts.color || BLACK });
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
    x: txtX, y: y + h - 10, size: 7, font: fontBold, color: rgb(0.33, 0.33, 0.33),
  });

  // FIX (William 2026-09-20 v70): Token ACIMA do tracejado (nao em cima),
  // senao o tracejado passava por cima do texto do Token.
  // Layout (top -> bottom):
  //   1) "ASSINATURA DIGITAL" (label)         - topo
  //   2) Token (texto grande em azul)         - meio
  //   3) Linha tracejada                      - abaixo do Token
  //   4) Info RE + data/hora (rodape)         - base
  const tokenY = y + h - 28;             // 28pt abaixo do topo (deixa espaco pro label)
  const lineY = y + h * 0.35;            // 35% da altura (abaixo do Token)
  page.drawText(`Token: ${hash}`, {
    x: txtX, y: tokenY, size: 18, font: fontBold, color: BLUE_DARK,
  });
  // Linha tracejada (entre Token e Info inferior)
  for (let lx = txtX; lx < txtX + txtW; lx += 6) {
    page.drawLine({
      start: { x: lx, y: lineY },
      end: { x: lx + 3, y: lineY },
      thickness: 0.5, color: rgb(0.53, 0.53, 0.53),
    });
  }

  // Info inferior
  page.drawText(`${reFull}    ${formatDateTime(signatario.timestamp)}`, {
    x: txtX, y: y + 4, size: 8, font: fontMono, color: rgb(0.27, 0.27, 0.27),
  });

  return hash;
}
