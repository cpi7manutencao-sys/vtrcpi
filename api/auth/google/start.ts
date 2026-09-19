// ============================================================
// GET /api/auth/google/start
// Redireciona o user pro OAuth consent do Google
// Query: ?redirect_uri=...
// (codificamos o redirect_uri no state pra ter no callback)
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";

export default function handler(req: VercelRequest, res: VercelResponse) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return res.status(500).json({ error: "GOOGLE_CLIENT_ID nao configurado" });
  }

  const { redirect_uri, state } = req.query as Record<string, string>;

  if (!redirect_uri) {
    return res.status(400).json({ error: "redirect_uri obrigatorio" });
  }

  // CSRF state: combina state do frontend + redirect_uri
  // Formato: <state>|<redirect_uri>
  const combinedState = `${state || ""}|${redirect_uri}`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri,
    response_type: "code",
    scope: "openid email profile",
    access_type: "online",
    state: combinedState,
    prompt: "select_account",
  });

  const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;

  res.statusCode = 302;
  res.setHeader("Location", googleAuthUrl);
  return res.end();
}
