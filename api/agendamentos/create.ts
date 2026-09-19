// ============================================================
// POST /api/agendamentos/create
// Cria novo agendamento
// Clone de convex/agendamentos.ts:create
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql, now } from "../_lib/db";
import { requireAuth } from "../_lib/auth";
import { getUserById, getUserUnit, requireViaturasRole } from "../_lib/agendamentos-helpers";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const auth = await requireAuth(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }

  const body = req.body || {};
  const session = auth.session;
  const user = await getUserById(session.userId);
  if (!user) {
    return res.status(404).json({ ok: false, error: "Usuario nao encontrado" });
  }

  // Resolve a unidade REQUERENTE (escolhida pelo PM)
  // Pode ser: code SIAFEM (ex: "607070000"), sigla ("CPI-7"), nome, ou "OUTRO"
  if (body.unidadeRequerente === "OUTRO") {
    if (!body.unidadeRequerenteOutro) {
      return res.status(400).json({ ok: false, error: "Para 'Outro', informe unidadeRequerenteOutro" });
    }
  }
  let unidadeRequerenteId: number | null = null;
  if (body.unidadeRequerente && body.unidadeRequerente !== "OUTRO") {
    // Tenta match por code
    const byCode = await sql`SELECT id FROM units WHERE code = ${body.unidadeRequerente} LIMIT 1`;
    if (byCode.rows[0]) {
      unidadeRequerenteId = byCode.rows[0].id;
    } else {
      // Tenta match por sigla
      const bySigla = await sql`SELECT id FROM units WHERE sigla = ${body.unidadeRequerente} LIMIT 1`;
      if (bySigla.rows[0]) {
        unidadeRequerenteId = bySigla.rows[0].id;
      } else {
        // Tenta match por nome
        const byName = await sql`SELECT id FROM units WHERE LOWER(name) = LOWER(${body.unidadeRequerente}) LIMIT 1`;
        if (byName.rows[0]) {
          unidadeRequerenteId = byName.rows[0].id;
        }
      }
    }
  }
  if (!unidadeRequerenteId && body.unidadeRequerente !== "OUTRO") {
    return res.status(400).json({ ok: false, error: "Unidade REQUERENTE nao encontrada: " + body.unidadeRequerente });
  }

  // FIX (William 2026-09-04 v2): RE do motorista eh SEMPRE obrigatorio.
  // A consulta SAT eh SEMPRE por conta do GESTOR na aprovacao,
  // independente de o solicitante ser o motorista ou nao.
  if (!body.motoristaRe || String(body.motoristaRe).replace(/\D/g, "").length < 2) {
    return res.status(400).json({ ok: false, error: "RE do motorista eh obrigatorio" });
  }

  // Resolve unidadeOrigem (automatica, com fallback inteligente)
  const unidadeOrigemId = await getUserUnit(user);

  // Valida cobertura: a unidade REQUERENTE deve ter pelo menos 1 gestor
  const isAdmin = user.viaturasRole === "admin" || user.isMaster === true || user.isMaster === 1;
  if (!isAdmin && unidadeRequerenteId) {
    // Busca gestores + admins
    const cobridoresRes = await sql`
      SELECT unidadesGestor FROM users
      WHERE (viaturasRole = 'gestor' OR viaturasRole = 'admin' OR isMaster = 1)
        AND active = 1
    `;
    let temGestor = false;
    for (const c of cobridoresRes.rows) {
      const ugs = parseJsonArray(c.unidadesGestor);
      if (ugs.includes(unidadeRequerenteId)) { temGestor = true; break; }
    }
    if (!temGestor) {
      // Tenta recursivamente (se a matriz cobre)
      const unit = await sql`SELECT parentUnit FROM units WHERE id = ${unidadeRequerenteId}`;
      if (unit.rows[0]?.parentUnit) {
        let temGestorPai = false;
        for (const c of cobridoresRes.rows) {
          const ugs = parseJsonArray(c.unidadesGestor);
          if (ugs.includes(unit.rows[0].parentUnit)) { temGestorPai = true; break; }
        }
        if (!temGestorPai) {
          return res.status(400).json({ ok: false, error: "Unidade REQUERENTE sem gestor nomeado. Avise o admin." });
        }
      } else {
        return res.status(400).json({ ok: false, error: "Unidade REQUERENTE sem gestor nomeado. Avise o admin." });
      }
    }
  }

  // Insere o agendamento
  const ts = now();
  await sql`
    INSERT INTO agendamentos (
      solicitante, postoGraduacao, re, nomeGuerra, email,
      unidadeRequerente, unidadeRequerenteOutro, unidadeOrigem, secaoSetor,
      tipoViaturaSolicitada, tipoViaturaOutro,
      dataMissao, destino, finalidade, oficialAutorizador, horarioApresentacao,
      solicitanteMotorista,
      motoristaRe, motoristaPosto, motoristaNome, motoristaOpm, motoristaOpmCode,
      motoristaCnh, motoristaBoletim, motoristaDataProva, motoristaPublicacoes,
      retiradaData, retiradaHora, devolucaoData, devolucaoHora,
      status, criadoEm
    ) VALUES (
      ${user.id}, ${user.postoGraduacao || ""}, ${user.re || ""}, ${user.warName || ""}, ${user.email},
      ${unidadeRequerenteId}, ${body.unidadeRequerente === "OUTRO" ? body.unidadeRequerenteOutro : null}, ${unidadeOrigemId}, ${body.secaoSetor || null},
      ${body.tipoViaturaSolicitada}, ${body.tipoViaturaOutro || null},
      ${body.dataMissao}, ${body.destino}, ${body.finalidade}, ${body.oficialAutorizador}, ${body.horarioApresentacao || null},
      ${body.solicitanteMotorista ? 1 : 0},
      ${body.motoristaRe || null}, ${body.motoristaPosto || null}, ${body.motoristaNome || null}, ${body.motoristaOpm || null}, ${body.motoristaOpmCode || null},
      ${body.motoristaCnh || null}, ${body.motoristaBoletim || null}, ${body.motoristaDataProva || null}, ${body.motoristaPublicacoes ? JSON.stringify(body.motoristaPublicacoes) : null},
      ${body.retiradaData}, ${body.retiradaHora}, ${body.devolucaoData}, ${body.devolucaoHora},
      'pendente', ${ts}
    )
  `;

  // Pega o ID recem-inserido (SQLite: last_insert_rowid)
  const idRes = await sql`SELECT last_insert_rowid() as id`;
  const newId = (idRes.rows[0] as any)?.id;

  return res.status(200).json({ ok: true, id: newId, _id: String(newId) });
}

function parseJsonArray(val: any): number[] {
  if (Array.isArray(val)) return val;
  if (typeof val === "string") {
    try { return JSON.parse(val); } catch { return []; }
  }
  return [];
}
