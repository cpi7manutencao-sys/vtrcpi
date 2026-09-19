// ============================================================
// GET /api/dashboard/evolucao-mensal?opm=X&subordinada=Y
// Evolucao mensal de viaturas (operando x baixada).
// CLONE FIEL de convex/dashboard.ts:evolucaoMensal
// Serie temporal de pontos mensais (nao por dia).
// Usa historico de viaturas (criadoEm, dataBaixa, dataReativadoEm)
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql, query } from "../_lib/db";
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

  const opm = req.query.opm ? parseInt(req.query.opm as string, 10) : null;
  const subordinada = req.query.subordinada ? parseInt(req.query.subordinada as string, 10) : null;

  const user = await getUserById(auth.session.userId);
  if (!user) return res.status(200).json({ ok: true, pontos: [], totalGeral: 0 });

  // 1) RLS
  let unidadesIncluir: number[] = [];
  if (user.viaturasRole === "admin" || user.isMaster) {
    const uRes = await sql`SELECT id FROM units WHERE active = 1`;
    unidadesIncluir = uRes.rows.map((r: any) => r.id);
  } else if (user.viaturasRole === "gestor" || user.viaturasRole === "editor") {
    const unidades = user.viaturasRole === "gestor"
      ? parseArr(user.unidadesGestor)
      : parseArr(user.unidadesEditor);
    if (unidades && unidades.length > 0) {
      unidadesIncluir = await getUserUnidadesAutorizadas(unidades);
    }
  } else {
    if (user.unit) unidadesIncluir = [user.unit];
  }

  if (unidadesIncluir.length === 0) {
    return res.status(200).json({ ok: true, pontos: [], totalGeral: 0 });
  }

  // 2) Filtra viaturas pelas unidades autorizadas
  // Exclui emDescarga (consistente com list/getTotais)
  const ph = unidadesIncluir.map(() => "?").join(",");
  const vRes = await query(
    `SELECT criadoEm, dataBaixa, dataReativadoEm, opm, emDescarga FROM viaturas WHERE opm IN (${ph}) AND emDescarga = 0`,
    unidadesIncluir
  );
  let viaturasFiltradas = vRes.rows;

  // 3) Filtro explicito do frontend
  if (subordinada) {
    viaturasFiltradas = viaturasFiltradas.filter((v: any) => v.opm === subordinada);
  } else if (opm) {
    // Pega a matriz + descendentes (recursivo)
    const todasUnits = (await sql`SELECT * FROM units`).rows;
    function descendentes(opmIdLocal: number): number[] {
      const acc: number[] = [opmIdLocal];
      for (const u of todasUnits) {
        if (u.parentUnit && u.parentUnit === opmIdLocal) {
          acc.push(...descendentes(u.id));
        }
      }
      return acc;
    }
    const descSet = new Set(descendentes(opm));
    viaturasFiltradas = viaturasFiltradas.filter((v: any) => descSet.has(v.opm));
  }

  if (viaturasFiltradas.length === 0) {
    return res.status(200).json({ ok: true, pontos: [], totalGeral: 0 });
  }

  // 4) Determina range de meses
  const criadoEmValues = viaturasFiltradas.map((v: any) => v.criadoEm).filter((x: any) => x);
  if (criadoEmValues.length === 0) {
    return res.status(200).json({ ok: true, pontos: [], totalGeral: 0 });
  }
  const minCriadoEm = Math.min(...criadoEmValues);
  const agora = Date.now();
  const inicio = new Date(minCriadoEm);
  inicio.setDate(1);
  inicio.setHours(0, 0, 0, 0);
  const fimAgora = new Date(agora);
  fimAgora.setMonth(fimAgora.getMonth() + 1);
  fimAgora.setDate(1);
  fimAgora.setHours(0, 0, 0, 0);

  // 5) Itera mes a mes
  const pontos: Array<{ mes: string; label: string; operando: number; baixada: number; total: number; pctOperando: number }> = [];
  let cursor = new Date(inicio);
  while (cursor < fimAgora) {
    const inicioMes = cursor.getTime();
    const fimMes = new Date(cursor);
    fimMes.setMonth(fimMes.getMonth() + 1);
    const tsFimMes = fimMes.getTime();

    let operando = 0;
    let baixada = 0;
    for (const v of viaturasFiltradas) {
      if (!v.criadoEm || v.criadoEm > tsFimMes) continue;
      if (v.dataBaixa && v.dataBaixa <= tsFimMes) {
        if (v.dataReativadoEm && v.dataReativadoEm >= inicioMes && v.dataReativadoEm < tsFimMes) {
          operando++;
        } else {
          baixada++;
        }
      } else {
        operando++;
      }
    }
    const total = operando + baixada;
    const pct = total > 0 ? Math.round((operando / total) * 1000) / 10 : 0;
    const mm = String(cursor.getMonth() + 1).padStart(2, "0");
    pontos.push({
      mes: cursor.getFullYear() + "-" + mm,
      label: cursor.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
      operando,
      baixada,
      total,
      pctOperando: pct,
    });
    cursor = fimMes;
  }

  return res.status(200).json({
    ok: true,
    pontos,
    totalGeral: viaturasFiltradas.length,
  });
}

function parseArr(val: any): number[] {
  if (Array.isArray(val)) return val;
  if (typeof val === "string") { try { return JSON.parse(val); } catch { return []; } }
  return [];
}
