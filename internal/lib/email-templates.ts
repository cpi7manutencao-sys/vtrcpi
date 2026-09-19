// ============================================================
// api/_lib/email-templates.ts
// Templates de email do sistema.
// Retorna { subject, text, html } prontos pra envio.
// ============================================================

export type AgendamentoAprovadoParams = {
  // Solicitante
  solicitantePosto: string;
  solicitanteNome: string;
  solicitanteEmail: string;
  // Aprovador
  aprovadorPosto: string;
  aprovadorNome: string;
  // Agendamento
  agendamentoId: number;
  dataMissao: string;        // ex: "11/09/2026"
  horaApresentacao: string;  // ex: "18:00"
  destino: string;
  finalidade: string;
  // Viatura atribuida (opcional)
  viaturaPlaca?: string | null;
  viaturaPrefixo?: string | null;
  // Motorista (opcional)
  motoristaPosto?: string | null;
  motoristaNome?: string | null;
  motoristaRe?: string | null;
  // Link IFCT
  linkIfct: string;
  // Data aprovacao
  aprovadoEm: string;        // ex: "10/09/2026, 17:15:18"
};

export function agendamentoAprovadoEmail(p: AgendamentoAprovadoParams) {
  const subject = `[Viaturas CPI-7] Agendamento #${p.agendamentoId} APROVADO - ICT disponivel - ${p.dataMissao}`;
  const text = renderAprovadoText(p);
  const html = renderAprovadoHtml(p);
  return { subject, text, html };
}

// ============================================================
// PLAIN TEXT (fallback)
// ============================================================
function renderAprovadoText(p: AgendamentoAprovadoParams): string {
  const viaturaLn = (p.viaturaPlaca || p.viaturaPrefixo)
    ? `Viatura: ${p.viaturaPrefixo || ""} ${p.viaturaPlaca || ""}`.trim()
    : "Viatura: (a definir)";
  const motoristaLn = p.motoristaNome
    ? `Motorista: ${p.motoristaPosto || ""} ${p.motoristaNome} ${p.motoristaRe ? `RE ${p.motoristaRe}` : ""}`.replace(/\s+/g, " ").trim()
    : "Motorista: (a definir)";

  return [
    `Prezado(a) ${p.solicitantePosto} ${p.solicitanteNome},`,
    ``,
    `Seu agendamento foi APROVADO pelo gestor da subfrota.`,
    ``,
    `===== DETALHES DA APROVAÇÃO =====`,
    `Nº Agendamento: ${p.agendamentoId}`,
    `Aprovado por: ${p.aprovadorPosto} ${p.aprovadorNome}`,
    `Aprovado em: ${p.aprovadoEm}`,
    ``,
    `===== DADOS DA MISSÃO =====`,
    `Data da missão: ${p.dataMissao}`,
    `Apresentar-se às: ${p.horaApresentacao} horas`,
    `Destino: ${p.destino}`,
    `Finalidade: ${p.finalidade}`,
    viaturaLn,
    motoristaLn,
    ``,
    `===== LINK DO ICT (Informe de Controle de Tráfego) =====`,
    `Acesse pelo celular do motorista (preencher KM, manutenção e encerrar):`,
    p.linkIfct,
    ``,
    `Qualquer dúvida, procure a subfrota.`,
    ``,
    `Sistema de Viaturas CPI-7`,
    `Polícia Militar do Estado de São Paulo`,
  ].join("\n");
}

// ============================================================
// HTML (renderiza bonitinho)
// ============================================================
function renderAprovadoHtml(p: AgendamentoAprovadoParams): string {
  const viaturaLn = (p.viaturaPlaca || p.viaturaPrefixo)
    ? `<tr><td><b>Viatura</b></td><td>${escapeHtml((p.viaturaPrefixo || "") + " " + (p.viaturaPlaca || "")).trim()}</td></tr>`
    : `<tr><td><b>Viatura</b></td><td><i>(a definir)</i></td></tr>`;
  const motoristaLn = p.motoristaNome
    ? `<tr><td><b>Motorista</b></td><td>${escapeHtml(`${p.motoristaPosto || ""} ${p.motoristaNome} ${p.motoristaRe ? `RE ${p.motoristaRe}` : ""}`.replace(/\s+/g, " ").trim())}</td></tr>`
    : `<tr><td><b>Motorista</b></td><td><i>(a definir)</i></td></tr>`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; background: #f5f5f5; color: #222; }
  .wrap { max-width: 600px; margin: 24px auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 6px rgba(0,0,0,0.08); }
  .head { background: #1a237e; color: white; padding: 20px 24px; }
  .head h1 { margin: 0; font-size: 18px; font-weight: 600; }
  .head p { margin: 4px 0 0; font-size: 13px; opacity: 0.9; }
  .body { padding: 24px; }
  .greeting { font-size: 15px; margin-bottom: 16px; }
  .status { background: #e8f5e9; border-left: 4px solid #2e7d32; padding: 12px 16px; border-radius: 4px; margin: 16px 0; font-size: 14px; }
  .status b { color: #2e7d32; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px; }
  th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #eee; }
  th { background: #fafafa; font-weight: 600; color: #555; }
  .btn-wrap { text-align: center; margin: 28px 0 16px; }
  .btn { display: inline-block; background: #1976d2; color: white !important; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-weight: 600; font-size: 15px; box-shadow: 0 1px 3px rgba(25,118,210,0.4); }
  .link-box { background: #fafafa; border: 1px dashed #bbb; padding: 12px; border-radius: 4px; font-family: monospace; font-size: 12px; word-break: break-all; color: #555; margin: 8px 0 24px; }
  .footer { background: #fafafa; padding: 16px 24px; font-size: 12px; color: #888; text-align: center; border-top: 1px solid #eee; }
</style>
</head>
<body>
<div class="wrap">
  <div class="head">
    <h1>Sistema de Viaturas CPI-7</h1>
    <p>Polícia Militar do Estado de São Paulo</p>
  </div>
  <div class="body">
    <p class="greeting">Prezado(a) <b>${escapeHtml(p.solicitantePosto + " " + p.solicitanteNome)}</b>,</p>
    <div class="status">
      Seu agendamento de viatura foi <b>APROVADO</b> pelo gestor da subfrota.
    </div>
    <h3 style="margin: 24px 0 8px; font-size: 14px; color: #555;">Detalhes da aprovação</h3>
    <table>
      <tr><th style="width: 35%;">Nº Agendamento</th><td>#${p.agendamentoId}</td></tr>
      <tr><th>Aprovado por</th><td>${escapeHtml(p.aprovadorPosto + " " + p.aprovadorNome)}</td></tr>
      <tr><th>Aprovado em</th><td>${escapeHtml(p.aprovadoEm)}</td></tr>
    </table>
    <h3 style="margin: 24px 0 8px; font-size: 14px; color: #555;">Dados da missão</h3>
    <table>
      <tr><th style="width: 35%;">Data da missão</th><td>${escapeHtml(p.dataMissao)}</td></tr>
      <tr><th>Apresentar-se às</th><td>${escapeHtml(p.horaApresentacao)} horas</td></tr>
      <tr><th>Destino</th><td>${escapeHtml(p.destino)}</td></tr>
      <tr><th>Finalidade</th><td>${escapeHtml(p.finalidade)}</td></tr>
      ${viaturaLn}
      ${motoristaLn}
    </table>
    <h3 style="margin: 24px 0 8px; font-size: 14px; color: #555;">Link do ICT (Informe de Controle de Tráfego)</h3>
    <p style="font-size: 13px; color: #555; margin: 8px 0;">Acesse pelo celular do motorista para preencher KM, manutenção e encerrar a missão:</p>
    <div class="btn-wrap">
      <a class="btn" href="${escapeHtml(p.linkIfct)}">Abrir ICT no celular</a>
    </div>
    <p style="font-size: 11px; color: #888; margin: 8px 0;">Ou cole este link no navegador:</p>
    <div class="link-box">${escapeHtml(p.linkIfct)}</div>
  </div>
  <div class="footer">
    Sistema de Viaturas CPI-7 · Qualquer dúvida procure a subfrota<br>
    Este é um email automático, não responda diretamente.
  </div>
</div>
</body>
</html>`;
}

// ============================================================
// ICT NEGADO PELO GESTOR (v58)
// Email disparado pro motorista quando o gestor NEGA o ICT
// preenchido. Nega = justifica + volta ifctStatus pra pendente +
// manda link pra motorista corrigir.
// ============================================================
export type IctRejeitadoParams = {
  motoristaPosto: string;
  motoristaNome: string;
  gestorPosto: string;
  gestorNome: string;
  agendamentoId: number;
  dataMissao: string;
  destino: string;
  justificativa: string;
  linkIfct: string;
  validadoEm: string;
};

export function ictRejeitadoEmail(p: IctRejeitadoParams) {
  const subject = `[Viaturas CPI-7] ICT #${p.agendamentoId} precisa de correcoes - ${p.dataMissao}`;
  const text = renderRejeitadoText(p);
  const html = renderRejeitadoHtml(p);
  return { subject, text, html };
}

function renderRejeitadoText(p: IctRejeitadoParams): string {
  return [
    `Prezado(a) ${p.motoristaPosto} ${p.motoristaNome},`,
    ``,
    `O gestor revisou o ICT do agendamento #${p.agendamentoId} e pediu CORRECOES.`,
    `Acesse o link abaixo, revise os dados apontados e reenvie.`,
    ``,
    `===== DADOS DA MISSAO =====`,
    `Data: ${p.dataMissao}`,
    `Destino: ${p.destino}`,
    ``,
    `===== O QUE PRECISA CORRIGIR =====`,
    p.justificativa,
    ``,
    `===== LINK DO ICT =====`,
    `Acesse pelo celular:`,
    p.linkIfct,
    ``,
    `Validado por: ${p.gestorPosto} ${p.gestorNome}`,
    `Em: ${p.validadoEm}`,
    ``,
    `Sistema de Viaturas CPI-7`,
  ].join("\n");
}

function renderRejeitadoHtml(p: IctRejeitadoParams): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; background: #f5f5f5; color: #222; }
  .wrap { max-width: 600px; margin: 24px auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 6px rgba(0,0,0,0.08); }
  .head { background: #c62828; color: white; padding: 20px 24px; }
  .head h1 { margin: 0; font-size: 18px; font-weight: 600; }
  .head p { margin: 4px 0 0; font-size: 13px; opacity: 0.9; }
  .body { padding: 24px; }
  .greeting { font-size: 15px; margin-bottom: 16px; }
  .status { background: #fff3e0; border-left: 4px solid #ef6c00; padding: 12px 16px; border-radius: 4px; margin: 16px 0; font-size: 14px; }
  .status b { color: #c62828; }
  .justificativa { background: #ffebee; border: 1px solid #ef9a9a; padding: 16px; border-radius: 4px; margin: 16px 0; font-size: 14px; color: #c62828; white-space: pre-wrap; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px; }
  th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #eee; }
  th { background: #fafafa; font-weight: 600; color: #555; }
  .btn-wrap { text-align: center; margin: 28px 0 16px; }
  .btn { display: inline-block; background: #c62828; color: white !important; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-weight: 600; font-size: 15px; box-shadow: 0 1px 3px rgba(198,40,40,0.4); }
  .link-box { background: #fafafa; border: 1px dashed #bbb; padding: 12px; border-radius: 4px; font-family: monospace; font-size: 12px; word-break: break-all; color: #555; margin: 8px 0 24px; }
  .footer { background: #fafafa; padding: 16px 24px; font-size: 12px; color: #888; text-align: center; border-top: 1px solid #eee; }
</style>
</head>
<body>
<div class="wrap">
  <div class="head">
    <h1>Sistema de Viaturas CPI-7</h1>
    <p>ICT precisa de correcoes</p>
  </div>
  <div class="body">
    <p class="greeting">Prezado(a) <b>${escapeHtml(p.motoristaPosto + " " + p.motoristaNome)}</b>,</p>
    <div class="status">
      O gestor revisou seu ICT e pediu <b>CORRECOES</b>. Acesse o link abaixo, corrija e reenvie.
    </div>
    <h3 style="margin: 24px 0 8px; font-size: 14px; color: #555;">Dados da missao</h3>
    <table>
      <tr><th style="width: 35%;">Nº Agendamento</th><td>#${p.agendamentoId}</td></tr>
      <tr><th>Data da missao</th><td>${escapeHtml(p.dataMissao)}</td></tr>
      <tr><th>Destino</th><td>${escapeHtml(p.destino)}</td></tr>
    </table>
    <h3 style="margin: 24px 0 8px; font-size: 14px; color: #c62828;">O que precisa corrigir</h3>
    <div class="justificativa">${escapeHtml(p.justificativa)}</div>
    <p style="font-size: 12px; color: #888; margin-top: 4px;">
      Revisado por: <b>${escapeHtml(p.gestorPosto + " " + p.gestorNome)}</b> em ${escapeHtml(p.validadoEm)}
    </p>
    <h3 style="margin: 24px 0 8px; font-size: 14px; color: #555;">Link do ICT</h3>
    <p style="font-size: 13px; color: #555; margin: 8px 0;">Acesse pelo celular para corrigir:</p>
    <div class="btn-wrap">
      <a class="btn" href="${escapeHtml(p.linkIfct)}">Abrir ICT e corrigir</a>
    </div>
    <p style="font-size: 11px; color: #888; margin: 8px 0;">Ou cole este link no navegador:</p>
    <div class="link-box">${escapeHtml(p.linkIfct)}</div>
  </div>
  <div class="footer">
    Sistema de Viaturas CPI-7 · Qualquer duvida procure a subfrota<br>
    Este eh um email automatico, nao responda diretamente.
  </div>
</div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  if (!s) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
