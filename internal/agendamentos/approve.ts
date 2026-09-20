// ============================================================
// POST /api/agendamentos/approve
// Aprova um agendamento. So gestor/editor da unidade REQUERENTE pode.
// Clone de convex/agendamentos.ts:approve
//
// v54 (William 2026-09-14): email pro solicitante foi MOVIDO pro
// atribuir.ts (so sai quando viatura eh atribuida, na hora que o
// ciclo fica completo). Aqui fica so a aprovacao.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql, now } from "../lib/db";
import { requireAuth } from "../lib/auth";
import { getUserById } from "../lib/agendamentos-helpers";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const auth = await requireAuth(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }

  const { agendamentoId } = req.body || {};
  if (!agendamentoId) {
    return res.status(400).json({ ok: false, error: "agendamentoId obrigatorio" });
  }

  const session = auth.session;
  const user = await getUserById(session.userId);
  if (!user) {
    return res.status(404).json({ ok: false, error: "Usuario nao encontrado" });
  }
  // FIX (William 2026-09-19): master admin NAO bypassa mais a checagem de unidades.
  // Cada gestor (incluindo master) so pode aprovar solicitacoes das unidades que cobre.
  // Isso garante que "cada gestor so pode aprovar solicitacoes para sua propria unidade".
  if (user.viaturasRole !== "gestor" && user.viaturasRole !== "admin" && !user.isMaster) {
    return res.status(403).json({ ok: false, error: "Sem permissao para aprovar agendamento" });
  }

  const agRes = await sql`SELECT * FROM agendamentos WHERE id = ${agendamentoId} LIMIT 1`;
  const ag = agRes.rows[0];
  if (!ag) return res.status(404).json({ ok: false, error: "Agendamento nao encontrado" });
  if (ag.status !== "pendente") {
    return res.status(400).json({ ok: false, error: "Agendamento nao esta pendente (status=" + ag.status + ")" });
  }

  // FIX (William 2026-09-20 v68): APROVACAO soh pelo GESTOR DA UNIDADE SOLICITADA.
  // Antes (v67): permitia aprovar se cobrisse unidadeRequerente OU unidadeOrigem.
  // Problema: o proprio FABIO (gestor do 12BPMI=origem) aprovava pedidos FEITOS
  // POR ELE pra outra unidade (ex: CPI-7=ur=11). Conflito de interesse.
  // Regra correta: soh o gestor da unidade DESTINO (unidadeRequerente) aprova.
  // A regra "partes interessadas" continua soh pra VISIBILIDADE (ver a solicitacao).
  //
  // Lista CRUA do unidadesGestor/unidadesEditor do user (sem expansao hierarquica).
  // Master/admin continuam cobrindo unidades em unidadesGestor (lista explicita).
  const unidades = user.viaturasRole === "gestor"
    ? parseJsonArray(user.unidadesGestor)
    : parseJsonArray(user.unidadesEditor || user.unidadesGestor);
  const unidadesNum = unidades.map((u: any) => Number(u));
  let podeAprovar = false;
  if (ag.unidadeRequerente && unidadesNum.includes(Number(ag.unidadeRequerente))) {
    podeAprovar = true;
  }
  // Se tem viatura atribuida, verifica se eh da unidade autorizada
  if (!podeAprovar && ag.viaturaAtribuida) {
    const vtrRes = await sql`SELECT opm FROM viaturas WHERE id = ${ag.viaturaAtribuida} LIMIT 1`;
    const vtrOpm = Number(vtrRes.rows[0]?.opm);
    if (vtrOpm && unidadesNum.includes(vtrOpm)) {
      podeAprovar = true;
    }
  }
  if (!podeAprovar) {
    return res.status(403).json({ ok: false, error: "Apenas o gestor da unidade solicitada pode aprovar" });
  }

  const ts = now();
  await sql`
    UPDATE agendamentos
    SET status = 'aprovado', aprovadoPor = ${user.id}, aprovadoEm = ${ts}, atualizadoEm = ${ts}
    WHERE id = ${agendamentoId}
  `;

  return res.status(200).json({ ok: true });
}

function parseJsonArray(val: any): number[] {
  if (Array.isArray(val)) return val;
  if (typeof val === "string") {
    try { return JSON.parse(val); } catch { return []; }
  }
  return [];
}
