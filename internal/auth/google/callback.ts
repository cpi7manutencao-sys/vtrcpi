// ============================================================
// GET /api/auth/google/callback
// Google redireciona o user pra cá com ?code=...&state=...
// Troca o code por id_token, valida, busca/cria user, retorna JWT
// Renderiza um HTML que faz postMessage pro popup pai e fecha.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql, now } from "../../lib/db";
import { exchangeCode, verifyGoogleToken } from "../../lib/google";
import { signSession } from "../../lib/jwt";
import { audit } from "../../lib/audit";
import { isMasterCpf } from "../../lib/config";

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).send("Method not allowed");
  }

  const { code, state, error } = req.query as Record<string, string>;

  // Helper pra retornar erro pro popup
  function fail(message: string) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(renderResult({ error: message }));
    return;
  }

  if (error) {
    return fail(`Google: ${error}`);
  }
  if (!code) {
    return fail("Code não fornecido");
  }

  // Extrai redirect_uri do state (formato: <state>|<redirect_uri>)
  let redirect_uri: string | undefined;
  let frontendState: string | undefined;
  if (state && state.includes("|")) {
    const idx = state.indexOf("|");
    frontendState = state.substring(0, idx);
    redirect_uri = state.substring(idx + 1);
  }
  if (!redirect_uri) {
    return fail("redirect_uri não encontrado no state");
  }

  // Troca o code por tokens
  let idToken: string;
  try {
    const result = await exchangeCode(code, redirect_uri);
    idToken = result.idToken;
  } catch (e: any) {
    console.error("[google/callback] token exchange failed:", e.message);
    return fail(`Falha ao trocar code: ${e.message}`);
  }

  // Valida o id_token
  let payload: any;
  try {
    payload = await verifyGoogleToken(idToken);
  } catch (e: any) {
    console.error("[google/callback] verifyIdToken failed:", e.message);
    return fail(`Token inválido: ${e.message}`);
  }

  if (!payload?.sub || !payload?.email) {
    return fail("Payload do Google incompleto");
  }

  // Buscar/criar user - 3 estrategias:
  // 1) Por googleId (mesmo user que ja logou antes)
  // 2) Por email (William seed tem email, mas googleId placeholder)
  // 3) Criar novo
  // FIX (William 2026-09-10 v41): schema eh camelCase (clone Convex).
  // Antes tava snake_case (google_id, last_login, etc) o que dava
  // "no such column" no SQLite. Agora todos os campos sao camelCase.
  let userResult = await sql`SELECT * FROM users WHERE googleId = ${payload.sub}`;
  let user = userResult.rows[0];
  let isNewUser = false;

  if (!user) {
    // Tenta por email
    userResult = await sql`SELECT * FROM users WHERE email = ${payload.email}`;
    user = userResult.rows[0];
    if (user) {
      // User existe com esse email (seed do admin) - atualiza googleId
      // Se for CPF master, promove a admin master
      const shouldBeMaster = isMasterCpf(user.cpf);
      const updateResult = await sql`
        UPDATE users
        SET googleId = ${payload.sub},
            name = COALESCE(${payload.name}, name),
            picture = COALESCE(${payload.picture}, picture),
            lastLogin = ${now()},
            loginCount = COALESCE(loginCount, 0) + 1,
            isMaster = CASE WHEN ${shouldBeMaster}::boolean THEN TRUE ELSE isMaster END,
            approved = CASE WHEN ${shouldBeMaster}::boolean THEN TRUE ELSE approved END,
            role = CASE WHEN ${shouldBeMaster}::boolean THEN 'admin' ELSE role END,
            viaturasRole = CASE WHEN ${shouldBeMaster}::boolean THEN 'admin' ELSE viaturasRole END,
            escopo = CASE WHEN ${shouldBeMaster}::boolean THEN 'total' ELSE escopo END
        WHERE id = ${user.id}
        RETURNING *
      `;
      user = updateResult.rows[0];
    } else {
      // Cria novo
      isNewUser = true;
      const insertResult = await sql`
        INSERT INTO users (
          googleId, email, name, picture,
          role, viaturasRole, approved, active, escopo,
          isMaster, unidadesGestor, unidadesEditor,
          createdAt, loginCount
        )
        VALUES (
          ${payload.sub}, ${payload.email}, ${payload.name}, ${payload.picture || null},
          'user', 'viewer', FALSE, TRUE, 'restrito',
          FALSE, '[]', '[]',
          ${now()}, 1
        )
        RETURNING *
      `;
      user = insertResult.rows[0];
    }
  } else {
    // User existente - so atualiza lastLogin
    const updateResult = await sql`
      UPDATE users
      SET lastLogin = ${now()}, loginCount = COALESCE(loginCount, 0) + 1
      WHERE id = ${user.id}
      RETURNING *
    `;
    user = updateResult.rows[0];
  }

  if (!user.active) {
    return fail("Usuário desativado. Contate o administrador.");
  }

  const hasProfile = !!user.cpf;

  const session = {
    googleId: payload.sub,
    email: user.email,
    name: user.name,
    picture: user.picture,
    userId: user.id,
    cpf: user.cpf,
    re: user.re,
    warName: user.warName,
    postoGraduacao: user.postoGraduacao,
    unitId: user.unit,
    unitCode: user.opmCode,
    role: user.role,
    viaturasRole: user.viaturasRole,
    unidadesGestor: parseJsonArray(user.unidadesGestor),
    unidadesEditor: parseJsonArray(user.unidadesEditor),
    approved: user.approved,
    isMaster: user.isMaster,
    escopo: user.escopo || "restrito",
  };

  const token = await signSession(session);

  await audit(
    user.id,
    user.cpf,
    "auth.google",
    "user",
    String(user.id),
    { isNewUser, email: user.email, via: "oauth2_code" },
    req
  );

  // Renderiza HTML que faz postMessage pro popup pai
  const result = {
    token,
    session,
    isNewUser,
    needsProfile: !hasProfile,
    needsApproval: user.approved === false && !user.isMaster,
  };
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(renderResult(result));
}

// Helper pra parsear array JSON (campos unidadesGestor/Editor)
function parseJsonArray(v: any): any[] {
  if (Array.isArray(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function renderResult(data: any): string {
  // Escapa o JSON pra não quebrar o HTML
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  // Pega origin pra checar no postMessage
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Login Viaturas CPI-7</title>
<style>
  body { font-family: system-ui; padding: 40px; text-align: center; background: #f5f5f5; }
  .box { background: white; padding: 30px; border-radius: 8px; max-width: 400px; margin: 40px auto; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
  h1 { color: #1e3a5f; }
  .ok { color: #28a745; font-size: 48px; }
  .err { color: #dc3545; }
</style>
</head>
<body>
<div class="box">
  ${data.error
    ? `<h1 class="err">❌ Erro</h1><p>${data.error}</p>`
    : `<h1 class="ok">✓</h1><h1>Login OK</h1><p>Você pode fechar esta janela.</p>`
  }
</div>
<script>
(function() {
  var data = ${json};
  var payload = data.error
    ? { type: 'google_oauth_result', error: data.error }
    : { type: 'google_oauth_result', token: data.token, session: data.session, isNewUser: data.isNewUser, needsProfile: data.needsProfile, needsApproval: data.needsApproval };
  if (window.opener) {
    try { window.opener.postMessage(payload, window.location.origin); } catch (e) {}
  }
  setTimeout(function() { window.close(); }, ${data.error ? 4000 : 800});
})();
</script>
</body>
</html>`;
}
