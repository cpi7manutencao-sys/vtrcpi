// ============================================================
// auth.ts - Middleware de autenticação
// Lê JWT do header Authorization, valida, retorna session payload
// Se inválido, retorna erro 401
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifySession, type SessionPayload } from "./jwt";

export interface AuthedRequest extends VercelRequest {
  session?: SessionPayload;
}

/**
 * Lê e valida JWT do header Authorization: Bearer <token>
 * Retorna { ok: true, session } se OK
 * Retorna { ok: false, error, status } se falhou
 */
export async function requireAuth(req: VercelRequest): Promise<
  { ok: true; session: SessionPayload } | { ok: false; error: string; status: number }
> {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) {
    return { ok: false, error: "Token não fornecido", status: 401 };
  }
  const token = auth.substring("Bearer ".length).trim();
  if (!token) {
    return { ok: false, error: "Token vazio", status: 401 };
  }
  try {
    const session = await verifySession(token);
    return { ok: true, session };
  } catch (e: any) {
    return { ok: false, error: "Token inválido ou expirado", status: 401 };
  }
}

/**
 * Verifica permissão por role.
 * Hierarquia: viewer < editor < gestor < admin
 * isMaster (William) tem acesso total.
 */
export function hasRole(session: SessionPayload, minRole: "viewer" | "editor" | "gestor" | "admin"): boolean {
  if (session.isMaster) return true;
  const order = ["viewer", "editor", "gestor", "admin"];
  const userLevel = order.indexOf(session.viaturasRole);
  const requiredLevel = order.indexOf(minRole);
  return userLevel >= requiredLevel;
}

/**
 * Helper pra retornar erro de permissão.
 */
export function forbid(res: VercelResponse, msg = "Acesso negado"): VercelResponse {
  return res.status(403).json({ ok: false, error: msg });
}
