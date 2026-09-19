// ============================================================
// jwt.ts - Sign/verify JWT próprio (sessão de usuário)
// Usa `jose` (edge-friendly, sem deps nativas)
// ============================================================

import { SignJWT, jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "viaturas-pmesp-cpi7-2026-dev-secret-trocar-em-prod"
);

const ALG = "HS256";
const ISSUER = "viaturas-cpi7";
const AUDIENCE = "viaturas-cpi7-app";

export interface SessionPayload {
  // Identidade Google
  googleId: string;
  email: string;
  name: string;
  picture?: string;

  // Identidade app (criada após primeiro login)
  userId: number;          // BIGSERIAL do banco
  cpf?: string;
  re?: string;
  warName?: string;
  postoGraduacao?: string;
  unitId?: number;
  unitCode?: string;       // SIAFEM

  // Permissões
  role: string;
  viaturasRole: string;    // viewer | editor | gestor | admin
  unidadesGestor: number[];
  unidadesEditor: number[];
  approved: boolean;
  isMaster: boolean;
  escopo: string;
}

/**
 * Assina JWT com payload da sessão.
 * Expira em 7 dias.
 */
export async function signSession(payload: SessionPayload): Promise<string> {
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setExpirationTime("7d")
    .sign(SECRET);
}

/**
 * Verifica e retorna payload do JWT.
 * Lança erro se inválido/expirado.
 *
 * FIX (William 2026-09-15): JWT padrao usa 'sub' (subject) mas o codigo
 * esperava 'userId'. Mapeamos sub -> userId pra manter compatibilidade.
 */
export async function verifySession(token: string): Promise<SessionPayload> {
  const { payload } = await jwtVerify(token, SECRET, {
    issuer: ISSUER,
    audience: AUDIENCE,
  });
  const session = payload as unknown as SessionPayload;
  // FIX (William 2026-09-15): jose retorna `sub` (string) no payload. O codigo
  // do app usa `userId` (number). Mapeamos pra manter compatibilidade.
  if (session && (session as any).sub !== undefined && session.userId === undefined) {
    (session as any).userId = Number((session as any).sub);
  }
  return session;
}

/**
 * Decodifica SEM verificar (pra debug - NUNCA usar pra auth).
 */
export function decodeUnsafe(token: string): any {
  try {
    return JSON.parse(Buffer.from(token.split(".")[1], "base64").toString());
  } catch {
    return null;
  }
}
