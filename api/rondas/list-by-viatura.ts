// ============================================================
// GET /api/rondas/list-by-viatura?viaturaId=
// Lista rondas de uma viatura (historico).
// Clone de convex/rondas.ts:listRondasByViatura
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "../_lib/db";
import { requireAuth } from "../_lib/auth";
import { getUserById, getUserUnidadesAutorizadas } from "../_lib/agendamentos-helpers";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const auth = await requireAuth(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }

  const viaturaId = parseInt((req.query.viaturaId as string) || "0", 10);
  if (!viaturaId) {
    return res.status(400).json({ ok: false, error: "viaturaId obrigatorio" });
  }

  const user = await getUserById(auth.session.userId);
  if (!user) return res.status(200).json({ ok: true, rondas: [] });

  // RLS
  if (user.viaturasRole !== "admin" && !user.isMaster) {
    const unidades = user.viaturasRole === "gestor" ? parseArr(user.unidadesGestor)
      : user.viaturasRole === "editor" ? parseArr(user.unidadesEditor)
      : user.unit ? [user.unit] : [];
    if (!unidades || unidades.length === 0) {
      return res.status(200).json({ ok: true, rondas: [] });
    }
    const unidadesAutorizadas = await getUserUnidadesAutorizadas(unidades);
    const vRes = await sql`SELECT opm FROM viaturas WHERE id = ${viaturaId}`;
    if (!vRes.rows[0] || !unidadesAutorizadas.includes(vRes.rows[0].opm)) {
      return res.status(200).json({ ok: true, rondas: [] });
    }
  }

  const r = await sql`SELECT * FROM rondas WHERE viaturaId = ${viaturaId} ORDER BY preenchidoEm DESC`;
  return res.status(200).json({ ok: true, rondas: r.rows });
}

function parseArr(val: any): number[] {
  if (Array.isArray(val)) return val;
  if (typeof val === "string") { try { return JSON.parse(val); } catch { return []; } }
  return [];
}
