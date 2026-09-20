// ============================================================
// GET /api/auth/google/gmail-setup
//
// SETUP ONE-TIME pra gerar refresh_token do Gmail API.
//
// Acesse UMA vez no navegador (logado na cpi7manutencao@gmail.com):
//   https://vtrcpi-five.vercel.app/api/auth/google/gmail-setup
//
// Fluxo:
//   1. Redireciona pra Google consent com scope gmail.send + offline access
//   2. Google volta com ?code=...
//   3. Troca code por { access_token, refresh_token }
//   4. Mostra refresh_token na tela (copie e salve em GOOGLE_REFRESH_TOKEN no Vercel)
//
// Apos ter o refresh_token salvo, o mailer.ts usa Gmail API
// (POST /gmail/v1/users/me/messages/send) pra cada envio, sem depender
// de nodemailer/SMTP (que nao funciona em Vercel serverless).
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { OAuth2Client } from "google-auth-library";

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";

// Redirect_uri do setup: precisa ser EXATAMENTE a mesma registrada no
// Google Cloud Console. Em prod: https://vtrcpi-five.vercel.app/api/auth/google/gmail-setup
const SETUP_REDIRECT_URI =
  process.env.GMAIL_SETUP_REDIRECT_URI ||
  "https://vtrcpi-five.vercel.app/api/auth/google/gmail-setup";

// Scopes necessarias:
//   - gmail.send: permite ENVIAR emails (sem ler caixa de entrada)
//   - offline: garante que o Google retorna refresh_token
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
];

function htmlPage(title: string, body: string, status = 200): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
           max-width: 720px; margin: 40px auto; padding: 0 16px; color: #222; }
    h1 { color: #1976d2; }
    code { background: #f5f5f5; padding: 2px 6px; border-radius: 3px;
           font-size: 13px; word-break: break-all; }
    .token { background: #fff3e0; border: 2px solid #ff9800; padding: 12px;
             border-radius: 6px; margin: 12px 0; font-family: monospace;
             word-break: break-all; font-size: 14px; }
    .btn { display: inline-block; padding: 12px 20px; background: #1976d2;
           color: white; text-decoration: none; border-radius: 6px;
           font-weight: 600; margin: 8px 8px 8px 0; }
    .warn { background: #ffebee; border-left: 4px solid #c62828;
            padding: 12px; margin: 12px 0; }
    pre { background: #f5f5f5; padding: 12px; border-radius: 6px;
          overflow-x: auto; font-size: 12px; }
  </style>
</head>
<body>
${body}
</body>
</html>`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { code, error } = req.query as Record<string, string>;

  // ============================================================
  // 1) Sem code: redireciona pra Google consent
  // ============================================================
  if (!code) {
    if (error) {
      return res.status(400).send(htmlPage("Erro no consentimento",
        `<h1>❌ Erro no consentimento do Google</h1>
         <p><strong>${error}</strong></p>
         <p>Tente acessar esta URL novamente. Se o problema persistir, verifique se a conta
            <code>cpi7manutencao@gmail.com</code> esta correta.</p>`));
    }

    if (!CLIENT_ID) {
      return res.status(500).send(htmlPage("Configuracao faltando",
        `<h1>❌ GOOGLE_CLIENT_ID nao configurado</h1>
         <p>Adicione GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET nas variaveis de ambiente do Vercel.</p>`));
    }

    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: SETUP_REDIRECT_URI,
      response_type: "code",
      scope: SCOPES.join(" "),
      access_type: "offline",     // CRITICO: sem isso, NAO vem refresh_token
      prompt: "consent",           // CRITICO: forca o Google a pedir consentimento E gerar refresh_token
    });

    return res.status(302).setHeader("Location", `https://accounts.google.com/o/oauth2/v2/auth?${params}`).end();
  }

  // ============================================================
  // 2) Com code: troca por tokens
  // ============================================================
  try {
    const client = new OAuth2Client(CLIENT_ID, CLIENT_SECRET);
    const { tokens } = await client.getToken({ code, redirect_uri: SETUP_REDIRECT_URI });

    console.log("[gmail-setup] tokens recebidos (access_token=" +
      (tokens.access_token ? "sim" : "nao") +
      ", refresh_token=" + (tokens.refresh_token ? "sim" : "nao") +
      ", scope=" + tokens.scope + ")");

    if (!tokens.refresh_token) {
      return res.status(400).send(htmlPage("Refresh token nao veio",
        `<h1>⚠️ Refresh token nao foi retornado pelo Google</h1>
         <div class="warn">
           <strong>Causa comum:</strong> o Google NAO retorna refresh_token se voce ja autorizou este app antes.
           <br><br>
           <strong>Solucao:</strong> revogue o acesso em
           <a href="https://myaccount.google.com/permissions" target="_blank">myaccount.google.com/permissions</a>
           e tente novamente, OU adicione <code>&prompt=consent</code> a URL (ja adicionado).
         </div>
         <p>Token recebido:</p>
         <pre>${JSON.stringify(tokens, null, 2)}</pre>`));
    }

    const expiresAt = tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : "?";

    return res.status(200).send(htmlPage("Gmail refresh_token gerado",
      `<h1>✅ Gmail refresh_token gerado com sucesso!</h1>
       <p><strong>Proximos passos:</strong></p>
       <ol>
         <li>Copie o refresh_token abaixo</li>
         <li>Vá no Vercel dashboard &gt; Settings &gt; Environment Variables</li>
         <li>Adicione a variavel:
           <ul>
             <li><strong>Key:</strong> <code>GOOGLE_REFRESH_TOKEN</code></li>
             <li><strong>Value:</strong> (o refresh_token copiado)</li>
           </ul>
         </li>
         <li>Faca redeploy</li>
         <li>Pronto! Emails serao enviados via Gmail API 🎉</li>
       </ol>

       <h3>📋 refresh_token:</h3>
       <div class="token">${tokens.refresh_token}</div>

       <p><strong>Detalhes tecnicos (pra debug):</strong></p>
       <ul>
         <li>access_token expira em: ${expiresAt}</li>
         <li>scope: <code>${tokens.scope || "(vazio)"}</code></li>
         <li>token_type: <code>${tokens.token_type || "Bearer"}</code></li>
       </ul>

       <p style="color: #666; font-size: 12px; margin-top: 24px;">
         <strong>Seguranca:</strong> este refresh_token permite enviar emails em nome de
         <code>${tokens.id_token ? "(ver id_token)" : "?"}</code>. Guarde em local seguro.
         Pra revogar: <a href="https://myaccount.google.com/permissions" target="_blank">myaccount.google.com/permissions</a>.
       </p>`));
  } catch (e: any) {
    console.error("[gmail-setup] ERRO:", e?.message, e?.stack);
    return res.status(500).send(htmlPage("Erro ao trocar code por tokens",
      `<h1>❌ Erro</h1>
       <pre>${e?.message || JSON.stringify(e, null, 2)}</pre>
       <p>Tente novamente. Se persistir, verifique se a redirect_uri
          (<code>${SETUP_REDIRECT_URI}</code>) esta registrada EXATAMENTE igual
          no Google Cloud Console (APIs & Services &gt; Credentials &gt; OAuth 2.0 Client IDs).</p>`));
  }
}
