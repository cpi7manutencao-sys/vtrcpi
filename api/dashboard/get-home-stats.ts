// ============================================================
// GET /api/dashboard/get-home-stats
// Retorna contadores gerais pra home (cards)
// CLONE FIEL de convex/dashboard.ts:getHomeStats
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { query } from "../_lib/db";
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

  const user = await getUserById(auth.session.userId);
  if (!user) return res.status(200).json({ ok: true, stats: null });

  let pendentes = 0;
  let meusAgendamentos = 0;
  if (user.viaturasRole === "gestor" || user.viaturasRole === "admin") {
    const allRes = await query(`SELECT * FROM agendamentos WHERE status = 'pendente'`, []);
    const allPendentes = allRes.rows;

    if (user.viaturasRole === "admin" || user.isMaster) {
      pendentes = allPendentes.length;
    } else {
      const unidades = parseArr(user.unidadesGestor);
      if (unidades && unidades.length > 0) {
        const unidadesAutorizadas = await getUserUnidadesAutorizadas(unidades);
        pendentes = allPendentes.filter((a: any) =>
          a.unidadeRequerente && unidadesAutorizadas.includes(a.unidadeRequerente)
        ).length;
      }
    }
  }

  const meusRes = await query(`SELECT * FROM agendamentos WHERE solicitante = ?`, [user.id]);
  const meus = meusRes.rows;
  meusAgendamentos = meus.length;

  return res.status(200).json({
    ok: true,
    stats: {
      pendentes,
      meusAgendamentos,
      meusAprovados: meus.filter((a: any) => a.status === "aprovado").length,
      meusConcluidos: meus.filter((a: any) => a.status === "concluido").length,
    },
  });
}

function parseArr(val: any): number[] {
  if (Array.isArray(val)) return val;
  if (typeof val === "string") { try { return JSON.parse(val); } catch { return []; } }
  return [];
}
