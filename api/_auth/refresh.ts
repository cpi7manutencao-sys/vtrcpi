// ============================================================
// POST /api/auth/refresh
// Renova o JWT usando o token atual (mesma sessão, novo token)
// Header: Authorization: Bearer <jwt>
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "../_lib/db";
import { requireAuth } from "../_lib/auth";
import { signSession } from "../_lib/jwt";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const auth = await requireAuth(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }

  // Recarregar dados do banco (caso role/unit tenham mudado)
  const userResult = await sql`
    SELECT * FROM users WHERE id = ${auth.session.userId}
  `;
  const user = userResult.rows[0];
  if (!user) {
    return res.status(404).json({ ok: false, error: "Usuário não encontrado" });
  }
  if (!user.active) {
    return res.status(403).json({ ok: false, error: "Usuário desativado" });
  }

  const token = await signSession({
    googleId: auth.session.googleId,
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
  });

  return res.status(200).json({ ok: true, token });
}

function parseJsonArray(v: any): any[] {
  if (Array.isArray(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; }
  }
  return [];
}
