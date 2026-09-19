// ============================================================
// api/_lib/mailer.ts
// Helper de envio de email via SMTP (Gmail).
// Carrega config do .env (SMTP_HOST, SMTP_PORT, SMTP_USER, etc).
// Pool de conexoes (reuso) com nodemailer.
// Logs detalhados pra debug (sucesso OU erro).
// ============================================================

import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

let transporter: Transporter | null = null;
let transporterInitAt: number | null = null;
let transporterError: string | null = null;

function readEnv(): {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromName: string;
} {
  return {
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: parseInt(process.env.SMTP_PORT || "465", 10),
    secure: (process.env.SMTP_SECURE || "true") === "true",
    user: process.env.SMTP_USER || "",
    pass: (process.env.SMTP_PASS || "").replace(/\s+/g, ""), // tira espacos do app password
    fromName: process.env.SMTP_FROM_NAME || "Sistema de Viaturas CPI-7",
  };
}

export function getTransporter(): Transporter | null {
  if (transporter) return transporter;
  const env = readEnv();
  if (!env.user || !env.pass) {
    if (!transporterError) {
      transporterError = "SMTP_USER ou SMTP_PASS nao configurados no .env";
      console.log(`[mailer] ${transporterError}`);
    }
    return null;
  }
  try {
    transporter = nodemailer.createTransport({
      host: env.host,
      port: env.port,
      secure: env.secure,
      auth: { user: env.user, pass: env.pass },
      // Pool de conexoes (reuso evita reconectar a cada envio)
      pool: true,
      maxConnections: 3,
      // Timeout reduzido pra nao travar API
      connectionTimeout: 10_000,
      socketTimeout: 15_000,
    });
    transporterInitAt = Date.now();
    console.log(`[mailer] transporter criado (host=${env.host}:${env.port} user=${env.user})`);
    return transporter;
  } catch (e: any) {
    transporterError = e.message;
    console.log(`[mailer] falha ao criar transporter: ${e.message}`);
    return null;
  }
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

export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  // MODO DEV/MOCK: se SMTP_MOCK=true OU NODE_ENV=development, apenas
  // loga o email (nao envia de verdade). Util pra testar local sem
  // depender de SMTP externo (firewall da PM bloqueia SMTP).
  // Em prod (Vercel/AWS), SMTP_MOCK nao esta setado e o SMTP real funciona.
  const isMock =
    (process.env.SMTP_MOCK || "").toLowerCase() === "true" ||
    (process.env.NODE_ENV || "").toLowerCase() === "development";
  if (isMock) {
    const fakeId = `<${Date.now()}.${Math.random().toString(36).slice(2)}@mock.local>`;
    console.log(`[mailer][MOCK] email NAO enviado (DEV mode)`);
    console.log(`[mailer][MOCK]   to:      ${params.to}`);
    console.log(`[mailer][MOCK]   subject: ${params.subject}`);
    console.log(`[mailer][MOCK]   text (1st 200 chars): ${(params.text || "").slice(0, 200).replace(/\n/g, " | ")}`);
    return { ok: true, messageId: fakeId };
  }

  const t = getTransporter();
  const env = readEnv();
  if (!t) {
    return { ok: false, error: transporterError || "transporter indisponivel" };
  }
  if (!params.to) {
    return { ok: false, error: "parametro 'to' vazio" };
  }
  try {
    const from = `"${env.fromName}" <${env.user}>`;
    const info = await t.sendMail({
      from,
      to: params.to,
      replyTo: params.replyTo || env.user,
      subject: params.subject,
      text: params.text,
      html: params.html,
    });
    console.log(`[mailer] enviado pra ${params.to} - messageId=${info.messageId}`);
    return { ok: true, messageId: info.messageId };
  } catch (e: any) {
    console.log(`[mailer] erro ao enviar pra ${params.to}: ${e.message}`);
    return { ok: false, error: e.message };
  }
}

// Util: verifica se SMTP ta configurado (sem inicializar)
export function isMailerConfigured(): boolean {
  // Em modo MOCK, sempre retorna true (porque o mock simula sucesso)
  const isMock =
    (process.env.SMTP_MOCK || "").toLowerCase() === "true" ||
    (process.env.NODE_ENV || "").toLowerCase() === "development";
  if (isMock) return true;
  return !!(process.env.SMTP_USER && process.env.SMTP_PASS);
}
