// ============================================================
// GET /api/auth/me
// Retorna dados do user logado (re-valida no banco)
// Header: Authorization: Bearer <jwt>
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "../_lib/db";
import { requireAuth } from "../_lib/auth";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const auth = await requireAuth(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }

  const userResult = await sql`
    SELECT * FROM users WHERE id = ${auth.session.userId}
  `;
  const user = userResult.rows[0];
  if (!user) {
    return res.status(404).json({ ok: false, error: "Usuario nao encontrado" });
  }
  if (!user.active) {
    return res.status(403).json({ ok: false, error: "Usuario desativado" });
  }

  // Buscar nome da unidade (se tiver)
  let unit = null;
  if (user.unit) {
    const unitResult = await sql`SELECT * FROM units WHERE id = ${user.unit}`;
    const u = unitResult.rows[0];
    if (u) {
      unit = {
        _id: String(u.id),
        id: u.id,
        code: u.code,
        name: u.name,
        sigla: u.sigla,
        parentUnit: u.parentUnit ? String(u.parentUnit) : null,
        commandUnit: u.commandUnit ? String(u.commandUnit) : null,
      };
    }
  }

  // Parse unidadesGestor/Editor que vem como TEXT JSON
  const parseArr = (v: any) => {
    if (Array.isArray(v)) return v;
    if (typeof v === "string") { try { return JSON.parse(v); } catch { return []; } }
    return [];
  };

  return res.status(200).json({
    ok: true,
    user: {
      _id: String(user.id),         // clone Convex 1:1
      id: user.id,
      googleId: user.googleId,
      email: user.email,
      name: user.name,
      picture: user.picture,
      cpf: user.cpf,
      re: user.re,
      digre: user.digre,
      warName: user.warName,
      postoGraduacao: user.postoGraduacao,
      codptgr: user.codptgr,
      opmCode: user.opmCode,
      unitId: user.unit,
      unit: unit,
      sexo: user.sexo,
      dataNascimento: user.dataNascimento,
      telefone: user.telefone,
      role: user.role,
      viaturasRole: user.viaturasRole,
      unidadesGestor: parseArr(user.unidadesGestor),
      unidadesEditor: parseArr(user.unidadesEditor),
      approved: user.approved,
      active: user.active,
      escopo: user.escopo,
      isMaster: user.isMaster,
      lastLogin: user.lastLogin,
      loginCount: user.loginCount,
      createdAt: user.createdAt,
      promotedAt: user.promotedAt,
    },
  });
}
