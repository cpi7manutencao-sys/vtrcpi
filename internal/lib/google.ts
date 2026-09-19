// ============================================================
// google.ts - Validar Google ID Token (Sign-In com Google)
// + Trocar authorization code por tokens (OAuth 2.0 code flow)
// Usa google-auth-library (oficial Google)
// ============================================================

import { OAuth2Client } from "google-auth-library";

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";

let _client: OAuth2Client | null = null;
function getClient(): OAuth2Client {
  if (!_client) {
    _client = new OAuth2Client(CLIENT_ID, CLIENT_SECRET);
  }
  return _client;
}

export interface GooglePayload {
  sub: string;          // Google user ID (immutable)
  email: string;
  email_verified: boolean;
  name: string;
  picture: string;
  given_name?: string;
  family_name?: string;
}

/**
 * Valida o credential JWT retornado pelo Google Sign-In (GIS).
 * O frontend envia o `credential` (id_token) e a gente valida contra o CLIENT_ID.
 * Docs: https://developers.google.com/identity/sign-in/web/backend-auth
 */
export async function verifyGoogleToken(credential: string): Promise<GooglePayload> {
  if (!CLIENT_ID) {
    throw new Error("GOOGLE_CLIENT_ID não configurado");
  }
  const ticket = await getClient().verifyIdToken({
    idToken: credential,
    audience: CLIENT_ID,
  });
  const payload = ticket.getPayload();
  if (!payload) throw new Error("Google token inválido");
  if (!payload.email_verified) {
    throw new Error("Email do Google não verificado");
  }
  return {
    sub: payload.sub,
    email: payload.email!,
    email_verified: payload.email_verified!,
    name: payload.name!,
    picture: payload.picture!,
    given_name: payload.given_name,
    family_name: payload.family_name,
  };
}

/**
 * Troca o authorization code (OAuth 2.0 code flow) por id_token + access_token.
 * Docs: https://developers.google.com/identity/protocols/oauth2/web-server#httprest
 */
export async function exchangeCode(code: string, redirectUri: string): Promise<{ idToken: string; accessToken: string }> {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error("GOOGLE_CLIENT_ID ou GOOGLE_CLIENT_SECRET nao configurado");
  }
  const client = getClient();
  const { tokens } = await client.getToken({ code, redirect_uri: redirectUri });
  if (!tokens.id_token) {
    throw new Error("Google nao retornou id_token");
  }
  return {
    idToken: tokens.id_token,
    accessToken: tokens.access_token || "",
  };
}
