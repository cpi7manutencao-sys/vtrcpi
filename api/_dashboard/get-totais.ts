// ============================================================
// GET /api/dashboard/get-totais
// Retorna totais por unidade (igual a capa MAPA DE VIATURAS).
// CLONE FIEL de convex/dashboard.ts:getTotaisPorUnidade
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

  const user = await getUserById(auth.session.userId);
  if (!user) return res.status(200).json({ ok: true, unidades: [], geral: null });

  // RLS - igual Convex
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
    return res.status(200).json({ ok: true, unidades: [], geral: null });
  }

  // Pega TODAS as units (vamos agrupar por matriz)
  const todasUnitsRes = await sql`SELECT * FROM units`;
  const todasUnits = todasUnitsRes.rows;
  const unitsById = new Map<number, any>(todasUnits.map((u: any) => [u.id, u]));

  // FIX (William 2026-08-31): agrupa viatura na matriz BPM correta
  // usando AMBAS as hierarquias (tecnica + funcional):
  //  1) Se a unit eh matriz BPM (XX XX 0000, XX != 00) ou CPI-7
  //     (607000000), retorna o proprio id
  //  2) Se a unit tem parentUnit, sobe ate a matriz (hierr. tecnica)
  //  3) Se NAO tem parentUnit (Cias/Pels/Sub-OPMs desvinculados
  //     do BPM), usa o commandUnit pra agrupar pela matriz BPM
  //     que ela responde funcionalmente. Ex: 1a Cia do 7BPMI
  //     (commandUnit=7BPMI) agrupa como 7BPMI no Mapa Geral.
  //  4) Fallback: proprio id (vai aparecer como linha separada,
  //     mas o commandUnit SEMPRE existe pros BPMs/Cias/Sub-OPMs
  //     que foram cadastrados via seed)
  function findMatriz(opmId: number): number {
    let current = unitsById.get(opmId);
    if (!current) return opmId;
    if (current.code === "607000000") return current.id;
    const code = current.code || "";
    if (code.length === 9 && code.endsWith("0000") && code.substring(3, 5) !== "00") {
      return current.id;
    }
    if (current.parentUnit) {
      return findMatriz(current.parentUnit);
    }
    if (current.commandUnit) {
      const cmdUnit = unitsById.get(current.commandUnit);
      if (cmdUnit) {
        return findMatriz(cmdUnit.id);
      }
    }
    return current.id;
  }

  // Pega info das matrizes (CPI-7 + BPMs)
  const matrizesMap = new Map<number, { id: number, code: string, name: string }>();
  for (const u of todasUnits) {
    if (u.code === "607000000") {
      matrizesMap.set(u.id, { id: u.id, code: u.code, name: u.name });
    } else if (u.code && u.code.length === 9 && u.code.endsWith("0000") && u.code.substring(3, 5) !== "00") {
      matrizesMap.set(u.id, { id: u.id, code: u.code, name: u.name });
    }
  }

  // Filtra viaturas pelas unidades autorizadas
  const ph = unidadesIncluir.map(() => "?").join(",");
  const viaturasRes = await query(
    `SELECT opm, tipo, categoria, ativo, emDescarga FROM viaturas WHERE opm IN (${ph})`,
    unidadesIncluir
  );
  const viaturasFiltradas = viaturasRes.rows;

  // Agrupa por MATRIZ
  // Estrutura separa por TIPO (MT/CR) e por CATEGORIA (OP/ADM)
  // Cada viatura cai em 1 dos 3 estados x 2 categorias
  const porMatriz = new Map<number, any>();

  for (const viatura of viaturasFiltradas) {
    const opmId = viatura.opm;
    const matrizId = findMatriz(opmId);
    let entry = porMatriz.get(matrizId);
    if (!entry) {
      const matriz = matrizesMap.get(matrizId) || { id: matrizId, code: "", name: "Desconhecido" };
      entry = {
        matrizId: String(matriz.id),  // string igual Convex
        matrizCode: matriz.code,
        matrizName: matriz.name,
        // Totais
        total: 0,
        totalOp: 0,
        totalAdm: 0,
        motos: 0, carros: 0,
        opMotos: 0, opCarros: 0,
        admMotos: 0, admCarros: 0,
        // 3 estados
        operando: 0, opMoto: 0, opCarro: 0,
        emDescarga: 0, edMoto: 0, edCarro: 0,
        baixadas: 0, bMoto: 0, bCarro: 0,
        // Por estado x categoria (soh para baixadas, que e o unico com ADM)
        bOpMoto: 0, bOpCarro: 0,
        bAdmMoto: 0, bAdmCarro: 0,
      };
      porMatriz.set(matrizId, entry);
    }
    entry.total++;

    const isMoto = viatura.tipo === "MT";
    const isAdm = viatura.categoria === "ADM";
    const isOp = viatura.categoria === "OPERACIONAL";

    if (isMoto) entry.motos++;
    else entry.carros++;

    if (isOp) {
      entry.totalOp++;
      if (isMoto) entry.opMotos++;
      else entry.opCarros++;
    } else if (isAdm) {
      entry.totalAdm++;
      if (isMoto) entry.admMotos++;
      else entry.admCarros++;
    }

    if (viatura.emDescarga) {
      entry.emDescarga++;
      if (isMoto) entry.edMoto++;
      else entry.edCarro++;
    } else if (viatura.ativo) {
      entry.operando++;
      if (isMoto) entry.opMoto++;
      else entry.opCarro++;
    } else {
      entry.baixadas++;
      if (isMoto) entry.bMoto++;
      else entry.bCarro++;
      if (isOp) {
        if (isMoto) entry.bOpMoto++;
        else entry.bOpCarro++;
      } else if (isAdm) {
        if (isMoto) entry.bAdmMoto++;
        else entry.bAdmCarro++;
      }
    }
  }

  // Calcula % de baixa (NAO conta emDescarga)
  const unidades = Array.from(porMatriz.values()).map((u: any) => ({
    ...u,
    pctBaixaMoto: u.motos > 0 ? Math.round((u.bMoto / (u.opMoto + u.bMoto)) * 10000) / 100 : 0,
    pctBaixaCarro: u.carros > 0 ? Math.round((u.bCarro / (u.opCarro + u.bCarro)) * 10000) / 100 : 0,
  }));

  unidades.sort((a, b) => a.matrizCode.localeCompare(b.matrizCode));

  // Calcula geral (igual Convex)
  const geral = {
    totalGeral: unidades.reduce((s, u) => s + u.operando + u.baixadas, 0),
    totalFrota: unidades.reduce((s, u) => s + u.total, 0),
    totalMotos: unidades.reduce((s, u) => s + u.motos, 0),
    totalCarros: unidades.reduce((s, u) => s + u.carros, 0),
    totalOp: unidades.reduce((s, u) => s + u.totalOp, 0),
    totalAdm: unidades.reduce((s, u) => s + u.totalAdm, 0),
    totalOpMotos: unidades.reduce((s, u) => s + u.opMotos, 0),
    totalOpCarros: unidades.reduce((s, u) => s + u.opCarros, 0),
    totalAdmMotos: unidades.reduce((s, u) => s + u.admMotos, 0),
    totalAdmCarros: unidades.reduce((s, u) => s + u.admCarros, 0),
    totalOperando: unidades.reduce((s, u) => s + u.operando, 0),
    totalOperandoMoto: unidades.reduce((s, u) => s + u.opMoto, 0),
    totalOperandoCarro: unidades.reduce((s, u) => s + u.opCarro, 0),
    totalEmDescarga: unidades.reduce((s, u) => s + u.emDescarga, 0),
    totalEmDescargaMoto: unidades.reduce((s, u) => s + u.edMoto, 0),
    totalEmDescargaCarro: unidades.reduce((s, u) => s + u.edCarro, 0),
    totalBaixadas: unidades.reduce((s, u) => s + u.baixadas, 0),
    totalBaixadasMoto: unidades.reduce((s, u) => s + u.bMoto, 0),
    totalBaixadasCarro: unidades.reduce((s, u) => s + u.bCarro, 0),
    totalBaixadasOp: unidades.reduce((s, u) => s + u.bOpMoto + u.bOpCarro, 0),
    totalBaixadasOpMoto: unidades.reduce((s, u) => s + u.bOpMoto, 0),
    totalBaixadasOpCarro: unidades.reduce((s, u) => s + u.bOpCarro, 0),
    totalBaixadasAdm: unidades.reduce((s, u) => s + u.bAdmMoto + u.bAdmCarro, 0),
    totalBaixadasAdmMoto: unidades.reduce((s, u) => s + u.bAdmMoto, 0),
    totalBaixadasAdmCarro: unidades.reduce((s, u) => s + u.bAdmCarro, 0),
    mediaBaixaMoto: 0,
    mediaBaixaCarro: 0,
  };
  geral.mediaBaixaMoto = (geral.totalOperandoMoto + geral.totalBaixadasMoto) > 0
    ? Math.round((geral.totalBaixadasMoto / (geral.totalOperandoMoto + geral.totalBaixadasMoto)) * 10000) / 100 : 0;
  geral.mediaBaixaCarro = (geral.totalOperandoCarro + geral.totalBaixadasCarro) > 0
    ? Math.round((geral.totalBaixadasCarro / (geral.totalOperandoCarro + geral.totalBaixadasCarro)) * 10000) / 100 : 0;

  return res.status(200).json({ ok: true, unidades, geral });
}

function parseArr(val: any): number[] {
  if (Array.isArray(val)) return val;
  if (typeof val === "string") { try { return JSON.parse(val); } catch { return []; } }
  return [];
}
