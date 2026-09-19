// ============================================================
// GET /api/agendamentos/list-pendentes
// Lista agendamentos pendentes (para gestor aprovar).
// Clone de convex/agendamentos.ts:listPendentes
// ============================================================

import list from "./list";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  // Reusa list com query.status=pendente
  req.query = { ...(req.query || {}), status: "pendente" };
  return list(req, res);
}
