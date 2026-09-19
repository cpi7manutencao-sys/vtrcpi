// ============================================================
// GET /api/viatura-historico/list-by-viatura?viaturaId=
// Lista historico de baixa/reativacao de uma viatura.
// Clone de convex/viaturaHistorico.ts:listByViatura
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

  const viaturaId = parseInt((req.query.viaturaId as string) || "0", 10);
  if (!viaturaId) {
    return res.status(400).json({ ok: false, error: "viaturaId obrigatorio" });
  }

  const r = await sql`SELECT * FROM viaturaHistorico WHERE viaturaId = ${viaturaId} ORDER BY dataHora DESC`;

  // Enriquece com nome do user
  const eventos = r.rows;
  const userIds = [...new Set(eventos.map((e: any) => e.registradoPor).filter(Boolean))];
  const usersMap: Record<number, any> = {};
  for (const uid of userIds) {
    const uRes = await sql`SELECT id, warName, name, postoGraduacao, re FROM users WHERE id = ${uid}`;
    if (uRes.rows[0]) usersMap[uid] = uRes.rows[0];
  }

  const enriched = eventos.map((ev: any) => {
    const u = usersMap[ev.registradoPor];
    return {
      ...ev,
      _id: String(ev.id),                              // clone Convex 1:1
      registradoPorNome: u ? (u.warName || u.name || "—") : "(user removido)",
      registradoPorPosto: u ? (u.postoGraduacao || "") : "",
      registradoPorRe: u ? (u.re || "") : "",
    };
  });

  return res.status(200).json({ ok: true, historico: enriched });
}
