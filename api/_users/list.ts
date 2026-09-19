// ============================================================
// GET /api/users/list
// Lista todos os users (apenas gestor/admin)
// Query: ?onlyApproved=true|false (default true), ?search=texto
// Header: Authorization: Bearer <jwt>
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "../_lib/db";
import { requireAuth, hasRole } from "../_lib/auth";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const auth = await requireAuth(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }
  if (!hasRole(auth.session, "gestor")) {
    return res.status(403).json({ ok: false, error: "Apenas gestores podem listar" });
  }

  const onlyApproved = req.query.onlyApproved !== "false";
  const search = (req.query.search as string) || "";

  const parseArr = (v: any) => {
    if (Array.isArray(v)) return v;
    if (typeof v === "string") { try { return JSON.parse(v); } catch { return []; } }
    return [];
  };

  let result;
  if (search) {
    const s = `%${search.toLowerCase()}%`;
    if (onlyApproved) {
      result = await sql`
        SELECT u.*, un.name as unitName, un.code as unitCode, un.sigla as unitSigla
        FROM users u
        LEFT JOIN units un ON un.id = u.unit
        WHERE (LOWER(u.name) LIKE ${s} OR LOWER(u.email) LIKE ${s}
               OR u.cpf LIKE ${s} OR u.re LIKE ${s})
          AND u.approved = 1
        ORDER BY u.name
        LIMIT 200
      `;
    } else {
      result = await sql`
        SELECT u.*, un.name as unitName, un.code as unitCode, un.sigla as unitSigla
        FROM users u
        LEFT JOIN units un ON un.id = u.unit
        WHERE (LOWER(u.name) LIKE ${s} OR LOWER(u.email) LIKE ${s}
               OR u.cpf LIKE ${s} OR u.re LIKE ${s})
        ORDER BY u.name
        LIMIT 200
      `;
    }
  } else {
    if (onlyApproved) {
      result = await sql`
        SELECT u.*, un.name as unitName, un.code as unitCode, un.sigla as unitSigla
        FROM users u
        LEFT JOIN units un ON un.id = u.unit
        WHERE u.approved = 1
        ORDER BY u.name
        LIMIT 200
      `;
    } else {
      result = await sql`
        SELECT u.*, un.name as unitName, un.code as unitCode, un.sigla as unitSigla
        FROM users u
        LEFT JOIN units un ON un.id = u.unit
        ORDER BY u.name
        LIMIT 200
      `;
    }
  }

  return res.status(200).json({
    ok: true,
    users: result.rows.map((r: any) => ({
      _id: String(r.id),                 // clone Convex 1:1
      id: r.id,
      email: r.email,
      name: r.name,
      picture: r.picture,
      cpf: r.cpf,
      re: r.re,
      digre: r.digre,
      warName: r.warName,
      postoGraduacao: r.postoGraduacao,
      codptgr: r.codptgr,
      unitId: r.unit,
      unit: r.unit ? { _id: String(r.unit), id: r.unit, name: r.unitName, code: r.unitCode, sigla: r.unitSigla } : null,
      opmCode: r.opmCode,
      role: r.role,
      viaturasRole: r.viaturasRole,
      unidadesGestor: parseArr(r.unidadesGestor),
      unidadesEditor: parseArr(r.unidadesEditor),
      approved: r.approved,
      active: r.active,
      isMaster: r.isMaster,
      escopo: r.escopo,
      lastLogin: r.lastLogin,
      loginCount: r.loginCount,
      createdAt: r.createdAt,
      promotedAt: r.promotedAt,
    })),
  });
}
