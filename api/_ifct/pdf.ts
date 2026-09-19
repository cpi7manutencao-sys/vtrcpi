// ============================================================
// GET /api/ifct/pdf?token=UUID
// PUBLIC (sem auth, usa token IFCT) - gera o PDF do IFCT
// Layout FRENTE/VERSO fiel ao MOCKUP DIGITAL V2 do William (2026-09-08).
// Usa pdfkit (server-side, sem dependencia de Chrome).
// Brasao PM lido de api/_lib/brasao.jpg (embutido no bundle).
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import PDFDocument from "pdfkit";
// @ts-ignore - svg-to-pdfkit nao tem tipos oficiais
import SVGtoPDF from "svg-to-pdfkit";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { sql } from "../_lib/db";

// FIX (William 2026-09-10 v51): registra doc.svg() no PROTOTIPO do PDFDocument
// uma unica vez no startup do modulo. ANTES (v50), chamava SVGtoPDF(doc) que
// falha com "the input does not look like a valid SVG" pq espera o SVG como
// argumento. Agora adiciona o metodo ao prototipo (igual README do svg-to-pdfkit)
// e renderiza o SVG real quando chamada.
let svgSupportInstalled = false;
function installSvgSupport() {
  if (svgSupportInstalled) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const proto = (PDFDocument as any).prototype;
    if (typeof proto.svg === "function") {
      svgSupportInstalled = true;
      return;
    }
    proto.svg = function (svg: string, x: number, y: number, opts: any = {}) {
      return SVGtoPDF(this, svg, x, y, opts), this;
    };
    svgSupportInstalled = true;
    console.log("[pdf] svg-to-pdfkit registrado em PDFDocument.prototype.svg");
  } catch (e) {
    console.log("[pdf] falha ao instalar svg-to-pdfkit:", (e as Error).message);
  }
}
installSvgSupport();

// Resolve o caminho do brasão. Em ESM/tsx no Windows, o caminho pode
// variar (slash, codificação). Tenta várias estratégias e usa a primeira
// que existir.
function resolveBrasaoPath(): string | null {
  const candidates: string[] = [];
  // 1) __dirname do arquivo
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    candidates.push(resolve(here, "..", "_lib", "brasao.jpg"));
  } catch {}
  // 2) CWD do processo
  candidates.push(resolve(process.cwd(), "api", "_lib", "brasao.jpg"));
  // 3) CWD com barra invertida
  candidates.push(resolve(process.cwd(), "api\\_lib\\brasao.jpg"));
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

const BRASAO_PATH = resolveBrasaoPath();
let brasaoBuffer: Buffer | null = null;
if (BRASAO_PATH) {
  try {
    brasaoBuffer = readFileSync(BRASAO_PATH);
    console.log(`[pdf] brasao carregado: ${brasaoBuffer.length} bytes`);
  } catch (e: any) {
    console.log(`[pdf] erro ao ler brasao: ${e.message}`);
    brasaoBuffer = null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const token = (req.query.token as string) || "";
  if (!token) {
    return res.status(400).json({ ok: false, error: "token obrigatorio" });
  }

  // ============================================================
  // Busca todos os dados
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

  // Dados relacionados
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

  // Cria o documento PDF
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 18, bottom: 18, left: 18, right: 18 },
    info: {
      Title: `ICT-2026-${String(ag.id).padStart(3, "0")}`,
      Author: "Sistema de Viaturas CPI-7",
      Subject: "Informe de Controle de Tráfego",
    },
    bufferPages: true,
  });

  // Coleta em buffer (funciona tanto com Vercel stream quanto com server-local)
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const endPromise = new Promise<void>((resolve, reject) => {
    doc.on("end", () => resolve());
    doc.on("error", reject);
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `inline; filename="ICT-2026-${String(ag.id).padStart(3, "0")}.pdf"`
  );

  // ============================================================
  // Helpers locais
  // ============================================================
  const PAGE_W = doc.page.width;
  const M = 18; // margin lateral
  const CONTENT_W = PAGE_W - 2 * M; // largura útil

  // FIX (William 2026-09-08 v24 + v40b): Partida = horario em que o motorista
  // CONFIRMOU o KM inicial (nao a estimativa do agendamento).
  // Prioridade: encerramento.partidaConfirmadaEm > ag.retiradaData
  // v40b: usa formatDateTime (hora exata do timestamp, NAO estimativa)
  const tsPartida = encerramento?.partidaConfirmadaEm ?? ag.retiradaData ?? null;
  const dataPartida = tsPartida ? formatDateTime(tsPartida) : "—";
  // Retorno: encerramento.dataHora (FINALIZACAO) ou ag.concluidoEm ou ag.devolucaoData
  const tsRetorno = encerramento?.dataHora ?? ag.concluidoEm ?? ag.devolucaoData ?? null;
  const dataRetorno = tsRetorno ? formatDateTime(tsRetorno) : "—";

  // FIX (William 2026-09-08 v25): label so "Condutor" (sem detalhamento).
  // O valor mantem posto + nome + RE.
  const condutorTexto = [
    ag.motoristaPosto || ag.postoGraduacao || "",
    ag.motoristaNome || ag.warName || ag.nomeGuerra || "",
    ag.motoristaRe ? `RE ${ag.motoristaRe}` : "",
  ]
    .filter(Boolean)
    .join(" ")
    .trim() || "—";

  // Calcula Diferença do Hodômetro. Prioridade:
  //   1) encerramento.hodometroDiferenca
  //   2) ag.kmRodados
  //   3) devolucao - retirada (calculado)
  const diferencaKm = encerramento?.hodometroDiferenca
    ?? ag.kmRodados
    ?? (ag.odometroRetirada != null && ag.odometroDevolucao != null
          ? ag.odometroDevolucao - ag.odometroRetirada
          : null);
  const partidaKm = encerramento?.hodometroPartida ?? ag.odometroRetirada ?? null;
  const retornoKm = encerramento?.hodometroRetorno ?? ag.odometroDevolucao ?? null;

  // FIX (William 2026-09-08 v24): TIPO e GRUPO calculados do prefixo.
  // Regra:
  //   - GRUPO = prefixo COMPLETO (ex: "13-76")
  //   - TIPO = parte ANTES do hifem (ex: "13-76" -> "13")
  //   - Se o prefixo comeca com "I", TIPO = prefixo completo (caso atipico)
  const prefixoViatura: string | null = viatura?.prefixo ?? null;
  let tipoViatura = "—";
  let grupoViatura = "—";
  if (prefixoViatura) {
    grupoViatura = prefixoViatura;
    if (prefixoViatura.startsWith("I")) {
      // Caso atipico: TIPO = prefixo completo
      tipoViatura = prefixoViatura;
    } else {
      tipoViatura = prefixoViatura.split("-")[0] || prefixoViatura;
    }
  }

  // ============================================================
  // FRENTE (página 1)
  // ============================================================
  const PAGE_TOP = M;

  // FIX (William 2026-09-08 v24): cabeçalho amarelo removido.
  // O IFCT real não tem o aviso de "Mockup digital v2...".
  let y = PAGE_TOP;

  // --- (A) BLOCO: BRASÃO + SECRETARIA/SUBFROTA/CIDADE + PARTIDA/RETORNO ---
  const blocoTopH = 56;
  // Brasão (quadrado à esquerda)
  const brasaoX = M;
  const brasaoY = y;
  const brasaoW = 56;
  if (brasaoBuffer) {
    try {
      doc.image(brasaoBuffer, brasaoX, brasaoY, { width: brasaoW, height: blocoTopH, fit: [brasaoW, blocoTopH] });
    } catch {
      drawBrasaoFallback(doc, brasaoX, brasaoY, brasaoW, blocoTopH);
    }
  } else {
    drawBrasaoFallback(doc, brasaoX, brasaoY, brasaoW, blocoTopH);
  }
  doc.rect(brasaoX, brasaoY, brasaoW, blocoTopH).stroke(); // moldura

  // Secretaria/Subfrota/Cidade (centro)
  const secX = brasaoX + brasaoW + 4;
  const secW = CONTENT_W - brasaoW - 4 - 140; // sobra 140 pra Partida/Retorno
  doc.rect(secX, y, secW, blocoTopH).stroke();
  // 3 linhas
  doc.font("Helvetica").fontSize(9.5).fillColor("black");
  const linha1Y = y + 5;
  doc.text("Secretaria da Segurança Pública", secX + 4, linha1Y, { width: secW - 8 });
  const linha2Y = y + 20;
  const linha3Y = y + 36;
  // linha separadora 1
  doc.moveTo(secX, linha2Y - 1).lineTo(secX + secW, linha2Y - 1).stroke();
  // linha separadora 2
  doc.moveTo(secX, linha3Y - 1).lineTo(secX + secW, linha3Y - 1).stroke();
  doc.font("Helvetica-Bold").fontSize(11).fillColor("black")
    .text(
      `Subfrota ${unidadeRequerente?.sigla || unidadeRequerente?.name || "CPI-7"}`,
      secX + 4, linha2Y + 1, { width: secW - 8 }
    );
  doc.font("Helvetica").fontSize(10).fillColor("black")
    .text(
      unidadeOrigem?.cidade || unidadeOrigem?.municipio || "Sorocaba",
      secX + 4, linha3Y + 1, { width: secW - 8 }
    );

  // Partida / Retorno (direita)
  const prX = secX + secW + 4;
  const prW = 136;
  doc.rect(prX, y, prW, blocoTopH).stroke();
  doc.font("Helvetica").fontSize(8.5).fillColor("black");
  doc.text("Partida (data e hora)", prX + 4, y + 4, { width: prW - 8 });
  doc.font("Helvetica-Bold").fontSize(9.5)
    .text(dataPartida, prX + 4, y + 15, { width: prW - 8 });
  // separador
  doc.moveTo(prX, y + 28).lineTo(prX + prW, y + 28).stroke();
  doc.font("Helvetica").fontSize(8.5)
    .text("Retorno (data e hora)", prX + 4, y + 30, { width: prW - 8 });
  doc.font("Helvetica-Bold").fontSize(9.5)
    .text(dataRetorno, prX + 4, y + 41, { width: prW - 8 });

  y += blocoTopH + 6;

  // --- (C) Nº CONTROLE DE TRÁFEGO + DECRETO ---
  doc.font("Helvetica").fontSize(9).fillColor("black")
    .text("Nº Controle de Tráfego", M, y + 2);
  doc.font("Helvetica-Bold").fontSize(11).fillColor("#1a237e")
    .text(`ICT-2026-${String(ag.id).padStart(3, "0")}`, M + 115, y);
  doc.font("Helvetica-Oblique").fontSize(7.5).fillColor("#555")
    .text("(Decreto nº 979, de 23-1-1973)", PAGE_W - M - 110, y + 4,
      { width: 110, align: "right" });
  y += 16;

  // Linha divisoria
  doc.moveTo(M, y).lineTo(PAGE_W - M, y).lineWidth(0.5).stroke();
  doc.lineWidth(1);
  y += 4;

  // --- (D) TABELA: PLACA | PATRIMÔNIO | TIPO | GRUPO ---
  const colW = CONTENT_W / 4;
  const tblHdrH = 14;
  const tblBodyH = 20;
  const tblY = y;
  // Header cinza
  doc.rect(M, tblY, CONTENT_W, tblHdrH).fillAndStroke("#eceff1", "#000");
  doc.fillColor("black").font("Helvetica-Bold").fontSize(9);
  doc.text("PLACA", M + 4, tblY + 3, { width: colW - 8 });
  doc.text("PATRIMÔNIO", M + colW + 4, tblY + 3, { width: colW - 8 });
  doc.text("TIPO", M + colW * 2 + 4, tblY + 3, { width: colW - 8 });
  doc.text("GRUPO", M + colW * 3 + 4, tblY + 3, { width: colW - 8 });
  // Linhas verticais do header
  doc.moveTo(M + colW, tblY).lineTo(M + colW, tblY + tblHdrH).stroke();
  doc.moveTo(M + colW * 2, tblY).lineTo(M + colW * 2, tblY + tblHdrH).stroke();
  doc.moveTo(M + colW * 3, tblY).lineTo(M + colW * 3, tblY + tblHdrH).stroke();
  // Body
  doc.rect(M, tblY + tblHdrH, CONTENT_W, tblBodyH).stroke();
  doc.moveTo(M + colW, tblY + tblHdrH).lineTo(M + colW, tblY + tblHdrH + tblBodyH).stroke();
  doc.moveTo(M + colW * 2, tblY + tblHdrH).lineTo(M + colW * 2, tblY + tblHdrH + tblBodyH).stroke();
  doc.moveTo(M + colW * 3, tblY + tblHdrH).lineTo(M + colW * 3, tblY + tblHdrH + tblBodyH).stroke();
  doc.fillColor("black").font("Helvetica-Bold").fontSize(11);
  doc.text(viatura?.placa || "—", M + 4, tblY + tblHdrH + 4, { width: colW - 8 });
  doc.text(viatura?.patrimonio || "—", M + colW + 4, tblY + tblHdrH + 4, { width: colW - 8 });
  doc.text(tipoViatura, M + colW * 2 + 4, tblY + tblHdrH + 4, { width: colW - 8 });
  doc.text(grupoViatura, M + colW * 3 + 4, tblY + tblHdrH + 4, { width: colW - 8 });
  y = tblY + tblHdrH + tblBodyH + 4;

  // --- (E) CONDUTOR ---
  drawLabelAndField(doc, M, y, CONTENT_W, "Condutor", 14, 16, condutorTexto, { bold: true, fontSize: 11 });
  y += 14 + 16 + 2;

  // --- (F) DESTINO E FINALIDADE DA MISSÃO ---
  drawLabelAndField(doc, M, y, CONTENT_W, "Destino e Finalidade da Missão", 14, 26, ag.destino || "—");
  y += 14 + 26 + 2;

  // --- (G) FINALIDADE (RESUMO) ---
  drawLabelAndField(doc, M, y, CONTENT_W, "Finalidade (resumo)", 14, 22, ag.finalidade || "—");
  y += 14 + 22 + 2;

  // --- (H) APRESENTAR-SE EM ---
  // FIX (William 2026-09-09 v29): usa horarioApresentacao (campo
  // especifico informado pelo solicitante) em vez de retiradaHora
  // (estimativa). Fallback pra retiradaHora se horarioApresentacao
  // for NULL (agendamentos antigos).
  const aprHora = ag.horarioApresentacao || ag.retiradaHora || "—";
  // FIX (William 2026-09-10 v52): removido "e 00 minutos" (nao faz sentido
  // mostrar minutos zerados - o horario ja' vem completo do solicitante).
  const aprText = `${formatDate(ag.dataMissao) || "—"} às ${aprHora} horas`;
  drawLabelAndField(doc, M, y, CONTENT_W, "Apresentar-se em", 14, 16, aprText);
  y += 14 + 16 + 4;

  // --- (I) TABELA ODÔMETRO + ABASTECIMENTO (lado a lado) ---
  const metW = (CONTENT_W - 14) / 2; // 14 = gap central + label vertical
  const metH = 96;
  const metY = y;

  // === LABEL VERTICAL ESQUERDA "Quilometragem" ===
  // FIX (William 2026-09-08 v24): "Odometro em" -> "Quilometragem" (correcao portuguesa)
  drawVerticalLabel(doc, M, metY, 14, metH, "Quilometragem");
  const odoX = M + 14;
  const odoW = metW - 14;

  // Header HODÔMETRO (FIX: "ODOMETRO" -> "HODOMETRO")
  doc.rect(odoX, metY, odoW, 14).fillAndStroke("#cfd8dc", "#000");
  doc.fillColor("black").font("Helvetica-Bold").fontSize(8.5)
    .text("HODÔMETRO", odoX + 4, metY + 4, { width: odoW - 8 });
  // Corpo
  doc.rect(odoX, metY + 14, odoW, metH - 14).stroke();
  // Linhas internas Partida | Retorno | Diferença
  const odoRowH = (metH - 14) / 3;
  // Partida
  doc.font("Helvetica").fontSize(9).fillColor("black")
    .text("Partida", odoX + 4, metY + 14 + (odoRowH - 9) / 2, { width: 50 });
  doc.text(
    partidaKm != null ? `${formatKm(partidaKm)} km` : "—",
    odoX + 56, metY + 14 + (odoRowH - 9) / 2, { width: odoW - 60 }
  );
  doc.moveTo(odoX, metY + 14 + odoRowH).lineTo(odoX + odoW, metY + 14 + odoRowH).stroke();
  // Retorno
  doc.font("Helvetica").fontSize(9)
    .text("Retorno", odoX + 4, metY + 14 + odoRowH + (odoRowH - 9) / 2, { width: 50 });
  doc.text(
    retornoKm != null ? `${formatKm(retornoKm)} km` : "—",
    odoX + 56, metY + 14 + odoRowH + (odoRowH - 9) / 2, { width: odoW - 60 }
  );
  doc.moveTo(odoX, metY + 14 + odoRowH * 2).lineTo(odoX + odoW, metY + 14 + odoRowH * 2).stroke();
  // Diferença (DESTAQUE AMARELO)
  doc.rect(odoX + 1, metY + 14 + odoRowH * 2 + 1, odoW - 2, odoRowH - 2)
    .fillAndStroke("#fff3cd", "#e0a800");
  doc.fillColor("black").font("Helvetica-Bold").fontSize(9)
    .text("Diferença", odoX + 4, metY + 14 + odoRowH * 2 + (odoRowH - 9) / 2, { width: 50 });
  doc.text(
    diferencaKm != null ? `${formatKm(diferencaKm)} km` : "—",
    odoX + 56, metY + 14 + odoRowH * 2 + (odoRowH - 9) / 2, { width: odoW - 60 }
  );

  // === TABELA ABASTECIMENTO ===
  const absX = odoX + odoW + 14;
  // Label vertical "Abastecimento" entre as duas tabelas
  drawVerticalLabel(doc, odoX + odoW, metY, 14, metH, "Abastecimento");

  doc.rect(absX, metY, metW, 14).fillAndStroke("#cfd8dc", "#000");
  doc.fillColor("black").font("Helvetica-Bold").fontSize(8.5)
    .text("ABASTECIMENTO", absX + 4, metY + 4, { width: metW - 8 });
  // Sub-header
  const subH = 14;
  const subNatW = metW * 0.36;
  const subQtdW = metW * 0.30;
  const subKmW = metW - subNatW - subQtdW;
  doc.rect(absX, metY + 14, metW, subH).stroke();
  doc.moveTo(absX + subNatW, metY + 14).lineTo(absX + subNatW, metY + 14 + subH).stroke();
  doc.moveTo(absX + subNatW + subQtdW, metY + 14).lineTo(absX + subNatW + subQtdW, metY + 14 + subH).stroke();
  doc.font("Helvetica").fontSize(8.5).fillColor("black")
    .text("Natureza", absX + 4, metY + 14 + 4, { width: subNatW - 8 })
    .text("Quantidade", absX + subNatW + 4, metY + 14 + 4, { width: subQtdW - 8 })
    .text("KM", absX + subNatW + subQtdW + 4, metY + 14 + 4, { width: subKmW - 8 });
  // Linhas
  const naturezas = ["Gasolina", "Álcool", "Diesel", "Óleo"];
  const absRowH = (metH - 14 - subH) / 4;
  let ay = metY + 14 + subH;
  naturezas.forEach((nat) => {
    doc.rect(absX, ay, metW, absRowH).stroke();
    doc.moveTo(absX + subNatW, ay).lineTo(absX + subNatW, ay + absRowH).stroke();
    doc.moveTo(absX + subNatW + subQtdW, ay).lineTo(absX + subNatW + subQtdW, ay + absRowH).stroke();
    // FIX (William 2026-09-10 v50): normaliza a natureza pra comparar
    // sem acento (ex: "Alcool" no DB == "Álcool" no PDF)
    const norm = (s: string) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const abs = abastecimentos.find((a: any) => norm(a.natureza) === norm(nat));
    doc.font("Helvetica").fontSize(9).fillColor("black")
      .text(nat, absX + 4, ay + (absRowH - 9) / 2, { width: subNatW - 8 })
      .text(abs ? `${abs.quantidadeLitros} L` : "—",
        absX + subNatW + 4, ay + (absRowH - 9) / 2, { width: subQtdW - 8, align: "right" })
      .text(abs ? formatKm(abs.odometro) : "—",
        absX + subNatW + subQtdW + 4, ay + (absRowH - 9) / 2, { width: subKmW - 8, align: "right" });
    ay += absRowH;
  });

  y = metY + metH + 6;

  // --- (J) EXPEDIDOR (gestor validador) - layout v26 ---
  // Caixa FULL WIDTH com a ASSINATURA DIGITAL GERADA PELO SISTEMA
  // (token baseado no cadastro do gestor + hash + timestamp).
  // Info do gestor (posto/nome/RE) fica em cima do "Baseado no Impresso...",
  // FORA da caixa do EXPEDIDOR.
  const expHdrH = 14;
  const expBoxH = 56;
  doc.rect(M, y, CONTENT_W, expHdrH).fillAndStroke("#cfd8dc", "#000");
  doc.fillColor("black").font("Helvetica-Bold").fontSize(8.5)
    .text("EXPEDIDOR (gestor da subfrota que aprova o agendamento)",
      M + 4, y + 4, { width: CONTENT_W - 8, align: "center" });
  // Caixa geral (full width) - borda
  doc.rect(M, y + expHdrH, CONTENT_W, expBoxH).stroke();
  // === CAIXA CHEIA: ASSINATURA DIGITAL GERADA PELO SISTEMA ===
  drawDigitalSignature(
    doc,
    M + 1, y + expHdrH + 1,
    CONTENT_W - 2, expBoxH - 2,
    {
      posto: expedidor?.postoGraduacao || "Cb PM",
      nome: expedidor?.warName || expedidor?.name || "WILLIAM",
      re: expedidor?.re || "",
      digre: expedidor?.digre || "",
      timestamp: ag.concluidoEm || ag.aprovadoEm || Date.now(),
    }
  );
  y += expHdrH + expBoxH + 6;

  // FIX (William v27): o nome do gestor fica ABAIXO do box
  // (ja' que o Token ficou em destaque dentro do box).
  // Alinhado a direita, em cima do "Baseado no Impresso...".
  const infoTxt = [
    expedidor?.postoGraduacao || "Cb PM",
    expedidor?.warName || expedidor?.name || "WILLIAM",
    expedidor?.re ? `RE ${expedidor.re}${expedidor.digre ? `-${expedidor.digre}` : ""}` : "",
  ].filter(Boolean).join(" ");
  doc.fillColor("black").font("Helvetica-Bold").fontSize(9)
    .text(infoTxt, M, y, { width: CONTENT_W, align: "right", lineBreak: false });
  y += 11;

  // "Baseado no Impresso Grafico do CSM/M Int" (FIX William v26)
  // Em 2 linhas: 1) texto; 2) data/hora alinhada a direita
  doc.fillColor("#666").font("Helvetica").fontSize(8);
  doc.text(
    "Baseado no Impresso Gráfico do CSM/M Int",
    PAGE_W - M - 220, y, { width: 220, align: "right", lineBreak: false }
  );
  y += 10;
  doc.fontSize(7.5)
    .text(formatDateTime(ag.concluidoEm || ag.aprovadoEm),
      PAGE_W - M - 220, y, { width: 220, align: "right", lineBreak: false });
  y += 12;

  // Rodapé PMESP - so "PM - L 9" (FIX William v25: tirou "Nº 9 - 10")
  const rodapeY = doc.page.maxY() - 4;
  doc.save();
  doc.font("Helvetica").fontSize(7).fillColor("#666");
  doc.text("PM - L 9", M, rodapeY, { lineBreak: false });
  doc.restore();

  // ============================================================
  // VERSO (página 2)
  // ============================================================
  doc.addPage();
  y = M;

  // --- (A) TÍTULO "O CONDUTOR PREENCHERÁ" ---
  doc.rect(M, y, CONTENT_W, 18).fillAndStroke("#e3f2fd", "#000");
  doc.fillColor("black").font("Helvetica-Bold").fontSize(11)
    .text("O CONDUTOR PREENCHERÁ", M + 4, y + 5,
      { width: CONTENT_W - 8, align: "center" });
  y += 24;

  // --- (B) DEFEITOS VERIFICADOS ---
  // FIX (William 2026-09-08 v40b): se nao tiver valor, usa o fallback
  // "A manutencao de 1o escalao foi realizada sem novidades" (o motorista
  // confirma isso na tela de manutencao do mobile).
  const defeitosTexto = (encerramento?.defeitosVerificados
    && encerramento.defeitosVerificados.trim() !== ""
    && encerramento.defeitosVerificados.trim() !== "—")
    ? encerramento.defeitosVerificados
    : "A manutenção de 1º escalão foi realizada sem novidades";
  drawLabelAndField(doc, M, y, CONTENT_W,
    "O condutor anotará os defeitos verificados:",
    12, 32, defeitosTexto);
  y += 12 + 32 + 4;

  // --- (C) OBSERVAÇÕES SOBRE MULTAS/IRREGULARIDADES/ACIDENTES ---
  drawLabelAndField(doc, M, y, CONTENT_W,
    "O condutor fará observações sobre multas, irregularidades e acidentes:",
    12, 32, encerramento?.observacoes || "—");
  y += 12 + 32 + 4;

  // --- (D) NOVA APRESENTAÇÃO? (checkbox + texto) ---
  const temNova = !!encerramento?.novaApresentacaoData;
  doc.font("Helvetica").fontSize(9).fillColor("black")
    .text("Nova Apresentação?", M, y + 2);
  // Checkbox
  const cbX = M + 96;
  const cbY = y;
  const cbS = 11;
  doc.rect(cbX, cbY, cbS, cbS).stroke();
  if (temNova) {
    // X manual dentro do checkbox
    doc.lineWidth(1.4);
    doc.moveTo(cbX + 2, cbY + 2).lineTo(cbX + cbS - 2, cbY + cbS - 2).stroke();
    doc.moveTo(cbX + cbS - 2, cbY + 2).lineTo(cbX + 2, cbY + cbS - 2).stroke();
    doc.lineWidth(1);
  }
  // "Especificar..." (label)
  doc.font("Helvetica").fontSize(9)
    .text("Especificar para o caso de sim: dia - hora - local",
      cbX + cbS + 6, y + 2);
  y += 14;

  // Campo de data/hora/local (se houver nova apresentação)
  if (temNova) {
    const fldH = 14;
    doc.rect(M, y, CONTENT_W, fldH).fillAndStroke("#fafafa", "#000");
    const aprTxt = [
      formatDate(encerramento.novaApresentacaoData),
      encerramento.novaApresentacaoHora ? `às ${encerramento.novaApresentacaoHora}` : "",
      encerramento.novaApresentacaoLocal ? `- ${encerramento.novaApresentacaoLocal}` : "",
    ].filter(Boolean).join(" ");
    doc.font("Helvetica").fontSize(9).fillColor("black")
      .text(aprTxt, M + 4, y + 3, { width: CONTENT_W - 8 });
    y += fldH + 4;
  } else {
    y += 4;
  }

  // --- (E) CONSIDERAÇÕES GERAIS ---
  drawLabelAndField(doc, M, y, CONTENT_W,
    "Considerações gerais sobre o veículo / condutor: e/ou",
    12, 28, encerramento?.consideracoesVeiculo || "—");
  y += 12 + 28 + 4;

  // --- (F) CONDUTOR (assina no celular com dedo/caneta) - layout v26 ---
  // FIX (William 2026-09-08 v26): a area de assinatura do CONDUTOR
  // tbm eh uma ASSINATURA DIGITAL GERADA PELO SISTEMA (token), NAO
  // a assinatura SVG desenhada pelo motorista na tela do IFCT.
  // FIX (William 2026-09-09 v28): label simplificado para "CONDUTOR"
  const condAssLabelH = 14;
  const condAssBoxH = 56;
  doc.rect(M, y, CONTENT_W, condAssLabelH).fillAndStroke("#cfd8dc", "#000");
  doc.fillColor("black").font("Helvetica-Bold").fontSize(8.5)
    .text("CONDUTOR",
      M + 4, y + 4, { width: CONTENT_W - 8, align: "center" });
  doc.rect(M, y + condAssLabelH, CONTENT_W, condAssBoxH).stroke();
  // Assinatura digital gerada pelo sistema
  drawDigitalSignature(
    doc,
    M + 1, y + condAssLabelH + 1,
    CONTENT_W - 2, condAssBoxH - 2,
    {
      posto: ag.motoristaPosto || ag.postoGraduacao || "",
      nome: ag.motoristaNome || ag.warName || ag.nomeGuerra || "",
      re: ag.motoristaRe || "",
      digre: ag.motoristaDigre || "",
      timestamp: encerramento?.dataHora || ag.concluidoEm || Date.now(),
    }
  );
  y += condAssLabelH + condAssBoxH + 2;
  // Nome do condutor
  doc.fillColor("black").font("Helvetica-Bold").fontSize(10)
    .text(condutorTexto, M, y, { width: CONTENT_W, align: "center" });
  y += 16;

  // --- (G) RONDA (FIX William v28: removeu "Bloco de Ronda", so "RONDA") ---
  const blocoRondaH = 16;
  doc.rect(M, y, CONTENT_W, blocoRondaH).fillAndStroke("#bbdefb", "#1976d2");
  doc.font("Helvetica-Bold").fontSize(11).fillColor("#0d47a1")
    .text("RONDA", M + 4, y + 4, { width: CONTENT_W - 8, align: "center" });
  y += blocoRondaH + 4;

  // Se nao tem nenhuma ronda, mostra o bloco VAZIO (com placeholders) igual mockup
  const rondasParaMostrar = rondas.length > 0 ? rondas : [null];

  rondasParaMostrar.forEach((r: any, i: number) => {
    if (i > 0) {
      // Separador entre rondas
      doc.moveTo(M, y).lineTo(PAGE_W - M, y).stroke();
      y += 4;
    }

    // Rondado por
    doc.font("Helvetica").fontSize(9).fillColor("black")
      .text("Rondado por", M, y + 1);
    y += 12;
    doc.rect(M, y, CONTENT_W, 14).fillAndStroke("#fafafa", "#000");
    doc.font("Helvetica").fontSize(10).fillColor("black")
      .text(r?.rondadoPor || "—", M + 4, y + 3, { width: CONTENT_W - 8 });
    y += 18;

    // Texto Livre
    doc.font("Helvetica").fontSize(9).fillColor("black")
      .text("Texto Livre (descrever o que foi verificado / irregularidade encontrada):", M, y);
    y += 12;
    const tlH = 30;
    doc.rect(M, y, CONTENT_W, tlH).stroke();
    doc.font("Helvetica").fontSize(9).fillColor("black")
      .text(r?.textoLivre || "—", M + 4, y + 4, { width: CONTENT_W - 8 });
    y += tlH + 4;

    // FIX (William 2026-09-10 v50): 4 colunas - Posto | Nome Guerra | RE | Unidade
    doc.font("Helvetica").fontSize(9).fillColor("black");
    const col4W = (CONTENT_W - 12) / 4;
    doc.text("Posto", M, y + 1, { width: col4W });
    doc.text("Nome de Guerra", M + col4W + 4, y + 1, { width: col4W });
    doc.text("RE", M + col4W * 2 + 8, y + 1, { width: col4W });
    doc.text("Unidade que pertence", M + col4W * 3 + 12, y + 1, { width: col4W });
    y += 12;
    const col4H = 14;
    doc.rect(M, y, col4W, col4H).stroke();
    doc.rect(M + col4W + 4, y, col4W, col4H).stroke();
    doc.rect(M + col4W * 2 + 8, y, col4W, col4H).stroke();
    doc.rect(M + col4W * 3 + 12, y, col4W, col4H).stroke();
    const reTxt = r?.re ? `RE ${r.re}${r.digre ? `-${r.digre}` : ""}` : "—";
    doc.font("Helvetica").fontSize(9).fillColor("black")
      .text(r?.posto || "—", M + 2, y + 3, { width: col4W - 4 })
      .text(r?.nomeGuerra || "—", M + col4W + 6, y + 3, { width: col4W - 4 })
      .text(reTxt, M + col4W * 2 + 10, y + 3, { width: col4W - 4 })
      .text(r?.unidadePertence || "—", M + col4W * 3 + 14, y + 3, { width: col4W - 4 });
    y += col4H + 6;

    // Assinatura do Rondante
    // FIX (William 2026-09-10 v51): se tem assinaturaSvg, renderiza o SVG via
    // doc.svg() (registrado em PDFDocument.prototype no startup do modulo).
    // Senao, mostra placeholder de area livre.
    const asRondH = 30;
    doc.rect(M, y, CONTENT_W, asRondH).stroke();
    if (r?.assinaturaSvg) {
      try {
        const dSvg = doc as any;
        if (typeof dSvg.svg === "function") {
          dSvg.svg(r.assinaturaSvg, M + 2, y + 2, {
            width: CONTENT_W - 4, height: asRondH - 4, useCSS: false,
            preserveAspectRatio: "xMidYMid meet",
          });
        } else {
          console.log("[pdf] doc.svg nao disponivel mesmo apos installSvgSupport()");
          doc.font("Helvetica-Oblique").fontSize(9).fillColor("#888")
            .text("[ Assinatura gravada - SVG renderer indisponivel ]",
              M + 4, y + (asRondH - 11) / 2, { width: CONTENT_W - 8, align: "center" });
        }
      } catch (e) {
        console.log("[pdf] erro ao renderizar assinatura SVG do rondante:", (e as Error).message);
        doc.font("Helvetica-Oblique").fontSize(9).fillColor("#888")
          .text("[ Erro ao carregar assinatura ]",
            M + 4, y + (asRondH - 11) / 2, { width: CONTENT_W - 8, align: "center" });
      }
    } else {
      doc.font("Helvetica-Oblique").fontSize(9).fillColor("#888")
        .text("[ Área de desenho livre - assina com dedo no celular ]",
          M + 4, y + (asRondH - 11) / 2, { width: CONTENT_W - 8, align: "center" });
    }
    y += asRondH + 6;
  });

  // ============================================================
  // 3ª PAGINA (opcional): COMPROVANTE(S) DE ABASTECIMENTO
  // FIX (William 2026-09-09 v35): so aparece se houver foto anexada
  // em pelo menos um abastecimento. A foto eh OBRIGATORIA no mobile.
  // ============================================================
  const absComFoto = (abastecimentos || []).filter((a: any) => !!a.fotoComprovante);
  if (absComFoto.length > 0) {
    doc.addPage();

    // Cabecalho da pagina
    const compHdrH = 20;
    doc.rect(M, M, CONTENT_W, compHdrH).fillAndStroke("#cfd8dc", "#000");
    doc.fillColor("black").font("Helvetica-Bold").fontSize(11)
      .text("COMPROVANTE(S) DE ABASTECIMENTO",
        M + 4, M + 4, { width: CONTENT_W - 8, align: "center" });
    y = M + compHdrH + 8;

    // Pra cada abastecimento com foto, mostra dados + foto
    for (let i = 0; i < absComFoto.length; i++) {
      const a = absComFoto[i];
      // Box do abastecimento
      const boxH = 12; // header
      const fotoMaxH = 200; // altura maxima da foto
      const dadosH = 30; // area de dados (natureza/quantidade/km)
      const totalH = boxH + dadosH + fotoMaxH + 20; // espacamento

      // Verifica se cabe na pagina atual
      if (y + totalH > doc.page.height - 30) {
        // Nao cabe - nova pagina
        doc.addPage();
        y = M;
      }

      // Header do abastecimento N
      doc.rect(M, y, CONTENT_W, boxH).fillAndStroke("#f5f5f5", "#000");
      doc.fillColor("black").font("Helvetica-Bold").fontSize(10)
        .text(`Abastecimento ${i + 1} de ${absComFoto.length}`,
          M + 4, y + 1, { width: CONTENT_W - 8 });
      y += boxH;

      // Dados (natureza, quantidade, KM, data)
      doc.rect(M, y, CONTENT_W, dadosH).stroke();
      doc.font("Helvetica").fontSize(9).fillColor("black");
      const dataAb = a.dataHora ? formatDateTime(a.dataHora) : "—";
      const linhaDados = [
        `Natureza: ${a.natureza}`,
        `Quantidade: ${a.quantidadeLitros} L`,
        `KM: ${formatKm(a.odometro)}`,
        `Data: ${dataAb}`,
      ].join("    •    ");
      doc.text(linhaDados, M + 6, y + 8, { width: CONTENT_W - 12 });
      if (a.posto) {
        doc.font("Helvetica-Oblique").fontSize(8).fillColor("#555")
          .text(`Posto: ${a.posto}`, M + 6, y + 20, { width: CONTENT_W - 12 });
      }
      y += dadosH;

      // Foto do comprovante
      try {
        const fotoData = a.fotoComprovante as string;
        // fotoComprovante eh um data URL "data:image/jpeg;base64,XXXXX"
        const m = fotoData.match(/^data:(image\/\w+);base64,(.+)$/);
        if (m) {
          const mime = m[1];
          const base64 = m[2];
          const ext = mime.split("/")[1] || "jpeg";
          const buffer = Buffer.from(base64, "base64");
          // Calcula dimensoes mantendo aspecto (max 480x180)
          const maxW = CONTENT_W - 8;
          const maxH = fotoMaxH;
          doc.image(buffer, M + 4, y, { fit: [maxW, maxH], align: "center" });
          // Calcula altura real baseada no aspect ratio (estimada)
          // Para 16:9, altura = 480 * 9/16 = 270 (mas max eh 180, entao 180)
          // Para 4:3, altura = 480 * 3/4 = 360 (mas max 180)
          // Como nao sei o aspect ratio exato sem parsear o JPEG, uso maxH
          y += maxH + 12;
        } else {
          doc.font("Helvetica-Oblique").fontSize(9).fillColor("#888")
            .text("[ Foto do comprovante anexada — formato nao reconhecido ]",
              M + 4, y + 20, { width: CONTENT_W - 8, align: "center" });
          y += 60;
        }
      } catch (e) {
        console.log("[pdf] erro ao renderizar foto:", (e as Error).message);
        doc.font("Helvetica-Oblique").fontSize(9).fillColor("#c62828")
          .text("[ Erro ao carregar foto do comprovante ]",
            M + 4, y + 20, { width: CONTENT_W - 8, align: "center" });
        y += 60;
      }
    }
  }

  // Finaliza
  doc.end();
  await endPromise;
  const pdfBuffer = Buffer.concat(chunks);
  return res.status(200).send(pdfBuffer);
}

// ============================================================
// Helpers
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

function formatKm(n: number): string {
  return n.toLocaleString("pt-BR");
}

// Desenha label em cima + retângulo com texto (label em negrito)
function drawLabelAndField(
  doc: PDFKit.PDFDocument,
  x: number, y: number, w: number,
  label: string, labelH: number, fieldH: number,
  value: string,
  opts: { bold?: boolean; fontSize?: number } = {}
) {
  doc.fillColor("black").font("Helvetica-Bold").fontSize(9)
    .text(label, x, y, { width: w });
  doc.rect(x, y + labelH, w, fieldH).fillAndStroke("#fafafa", "#000");
  doc.font(opts.bold ? "Helvetica-Bold" : "Helvetica")
    .fontSize(opts.fontSize || 10).fillColor("black")
    .text(value || "—", x + 4, y + labelH + 3, { width: w - 8 });
}

// Desenha label vertical (rotacionada 90° anti-horário) dentro de uma faixa
function drawVerticalLabel(
  doc: PDFKit.PDFDocument,
  x: number, y: number, w: number, h: number, text: string
) {
  doc.save();
  // Rotaciona em torno do centro da faixa
  const cx = x + w / 2;
  const cy = y + h / 2;
  doc.rotate(-90, { origin: [cx, cy] });
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#333")
    .text(text, cx - h / 2, cy - 4, { width: h, align: "center" });
  doc.restore();
}

// Brasão fallback (desenhado caso a imagem nao carregue)
function drawBrasaoFallback(
  doc: PDFKit.PDFDocument,
  x: number, y: number, w: number, h: number
) {
  doc.rect(x, y, w, h).fillAndStroke("#1a237e", "#000");
  doc.fillColor("white").font("Helvetica-Bold").fontSize(14)
    .text("PM", x, y + h / 2 - 14, { width: w, align: "center" });
  doc.fontSize(8).text("ESP", x, y + h / 2 + 4, { width: w, align: "center" });
}

// ============================================================
// Assinatura Digital GERADA PELO SISTEMA (William v26/v27)
// Diferente da assinatura desenhada: o sistema gera um "token" visual
// baseado no cadastro (posto/nome/RE) + timestamp + hash SHA-256.
// Aparencia: Brasao PM + linha de assinatura + nome em itálico +
// linha do hash + data/hora. Substitui o SVG desenhado tanto
// pro gestor quanto pro condutor/motorista.
// Rondante: continua sendo DESENHO LIVRE (nao usa essa funcao).
// Retorna o Token gerado pra ser usado fora do box (v27).
// ============================================================
function drawDigitalSignature(
  doc: PDFKit.PDFDocument,
  x: number, y: number, w: number, h: number,
  signatario: { posto?: string; nome?: string; re?: string; digre?: string; timestamp: number }
): string {
  // Borda
  doc.rect(x, y, w, h).fillAndStroke("#fffdf5", "#888");

  const posto = (signatario.posto || "").trim();
  const nome = (signatario.nome || "").trim();
  const re = (signatario.re || "").trim();
  const digre = (signatario.digre || "").trim();
  const reFull = re ? `RE ${re}${digre ? `-${digre}` : ""}` : "";

  // Gerar hash SHA-256 do (posto+nome+re+timestamp) e pegar 8 chars
  const tokenInput = `${posto}|${nome}|${re}|${signatario.timestamp}|viatura-cpi7`;
  const hash = createHash("sha256").update(tokenInput).digest("hex").slice(0, 8).toUpperCase();

  // === 1) BRASÃO PEQUENO (esquerda) ===
  const brasaoW = Math.min(40, h - 8);
  if (brasaoBuffer) {
    try {
      doc.image(brasaoBuffer, x + 4, y + 4, { width: brasaoW, height: brasaoW, fit: [brasaoW, brasaoW] });
    } catch {
      drawBrasaoFallback(doc, x + 4, y + 4, brasaoW, brasaoW);
    }
  } else {
    drawBrasaoFallback(doc, x + 4, y + 4, brasaoW, brasaoW);
  }

  // === 2) Label "ASSINATURA DIGITAL" (topo) ===
  const txtX = x + brasaoW + 12;
  const txtW = w - brasaoW - 16;
  doc.fillColor("#555").font("Helvetica-Bold").fontSize(7)
    .text("ASSINATURA DIGITAL", txtX, y + 4, { width: txtW, lineBreak: false });

  // === 3) Linha de assinatura tracejada ===
  const lineY = y + h * 0.55;
  doc.save();
  doc.strokeColor("#888").lineWidth(0.5);
  // linha tracejada
  for (let lx = txtX; lx < txtX + txtW; lx += 6) {
    doc.moveTo(lx, lineY).lineTo(lx + 3, lineY).stroke();
  }
  doc.restore();

  // === 4) TOKEN em ITÁLICO BOLD (cursiva, fonte script) ===
  // FIX (William v27): ao contrario do que eu fiz antes - o TOKEN fica
  // em destaque DENTRO do box (em vez do nome), e o nome do signatario
  // fica ABAIXO do box (ja' eh renderizado pelo codigo de chamada).
  doc.fillColor("#1a237e").font("Times-BoldItalic").fontSize(20);
  doc.text(`Token: ${hash}`, txtX, lineY - 18, { width: txtW, lineBreak: false });

  // === 5) Linha inferior: RE + Data/hora (sem Token, ja' em cima) ===
  doc.fillColor("#444").font("Courier").fontSize(7);
  const tsStr = formatDateTime(signatario.timestamp);
  const linhaInfo = `${reFull}    ${tsStr}`;
  doc.text(linhaInfo, txtX, y + h - 10, { width: txtW, lineBreak: false });

  return hash;
}
