// ============================================================
// mailer.ts - Envio de email via Gmail API
//
// FIX (William 2026-09-20 v73): trocar SMTP/nodemailer (que NAO
// funciona em Vercel Serverless - deps nativas) por Gmail API
// direta via fetch HTTP.
//
// Como funciona:
//   1. Pega access_token do refresh_token (GOOGLE_REFRESH_TOKEN env var)
//   2. Renova access_token a cada envio (expires em 1h)
//   3. Envia via POST /gmail/v1/users/me/messages/send com base64url do RFC 2822
//
// SETUP ONE-TIME:
//   Acesse https://vtrcpi-five.vercel.app/api/auth/google/gmail-setup
//   no navegador (logado na cpi7manutencao@gmail.com), copie o
//   refresh_token e adicione GOOGLE_REFRESH_TOKEN no Vercel env.
// ============================================================

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const GOOGLE_REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN || "";
const FROM_NAME = process.env.SMTP_FROM_NAME || "Sistema de Viaturas CPI-7";
const FROM_EMAIL = process.env.SMTP_FROM_EMAIL || "cpi7manutencao@gmail.com";

let _accessToken: string | null = null;
let _accessTokenExp: number = 0;

// Renova o access_token usando o refresh_token. Cache em memoria
// ate expirar (5min antes pra evitar race condition).
async function getAccessToken(): Promise<string> {
  if (_accessToken && Date.now() < _accessTokenExp - 5 * 60 * 1000) {
    return _accessToken;
  }
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
    throw new Error("GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN nao configurados");
  }
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: GOOGLE_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }).toString(),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Falha ao renovar access_token (${res.status}): ${txt}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  _accessToken = json.access_token;
  _accessTokenExp = Date.now() + json.expires_in * 1000;
  console.log(`[mailer] access_token renovado (expira em ${json.expires_in}s)`);
  return _accessToken;
}

// Monta a mensagem RFC 2822 e converte pra base64url (Gmail API exige)
function buildRawMessage(opts: { to: string; subject: string; text: string; html?: string; replyTo?: string }): string {
  const from = `"${FROM_NAME}" <${FROM_EMAIL}>`;
  const headers = [
    `From: ${from}`,
    `To: ${opts.to}`,
    opts.replyTo ? `Reply-To: ${opts.replyTo}` : "",
    `Subject: =?UTF-8?B?${Buffer.from(opts.subject).toString("base64")}?=`, // subject encoded pra suportar acentos
    "MIME-Version: 1.0",
    opts.html
      ? `Content-Type: multipart/alternative; boundary="vtr-boundary-001"`
      : `Content-Type: text/plain; charset=UTF-8`,
  ].filter(Boolean).join("\r\n");
  const body = opts.html
    ? [
        "--vtr-boundary-001",
        "Content-Type: text/plain; charset=UTF-8",
        "",
        opts.text,
        "",
        "--vtr-boundary-001",
        "Content-Type: text/html; charset=UTF-8",
        "",
        opts.html,
        "",
        "--vtr-boundary-001--",
        "",
      ].join("\r\n")
    : opts.text;
  const msg = `${headers}\r\n\r\n${body}`;
  // Gmail API usa base64url (sem + e /, com - e _)
  return Buffer.from(msg)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export type SendEmailParams = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
};

export type SendEmailResult = {
  ok: boolean;
  messageId?: string;
  error?: string;
};

export function isMailerConfigured(): boolean {
  return !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && GOOGLE_REFRESH_TOKEN);
}

export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  if (!isMailerConfigured()) {
    console.log("[mailer] Gmail API nao configurada (faltam GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN) - email NAO enviado");
    console.log(`[mailer][MOCK]   to:      ${params.to}`);
    console.log(`[mailer][MOCK]   subject: ${params.subject}`);
    return { ok: false, error: "Gmail API nao configurada (faltam GOOGLE_REFRESH_TOKEN)" };
  }
  if (!params.to) {
    return { ok: false, error: "parametro 'to' vazio" };
  }
  try {
    const accessToken = await getAccessToken();
    const raw = buildRawMessage(params);
    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
    });
    if (!res.ok) {
      const errBody = await res.text();
      console.log(`[mailer] Gmail API erro (${res.status}): ${errBody}`);
      return { ok: false, error: `Gmail API ${res.status}: ${errBody.substring(0, 200)}` };
    }
    const json = (await res.json()) as { id: string; threadId: string };
    console.log(`[mailer] enviado pra ${params.to} - messageId=${json.id}`);
    return { ok: true, messageId: json.id };
  } catch (e: any) {
    console.log(`[mailer] erro ao enviar pra ${params.to}: ${e.message}`);
    return { ok: false, error: e.message };
  }
}

// Mantido pra compat (nao faz nada agora)
export function getTransporter(): null {
  return null;
}
