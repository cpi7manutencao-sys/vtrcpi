// ============================================================
// POST /api/agendamentos/atualizar-motorista
// Atualiza os dados do motorista (preenchidos via SAT) de um agendamento.
// Usado pelo GESTOR para consultar o SAT quando o solicitante NAO eh o
// motorista. Atualiza todos os campos motorista* (exceto motoristaRe que
// ja foi preenchido pelo solicitante).
// Clone de convex/agendamentos.ts:atualizarMotorista (nova funcao, 2026-09-04)
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql, now } from "../_lib/db";
import { requireAuth, hasRole } from "../_lib/auth";
import { getUserById } from "../_lib/agendamentos-helpers";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const auth = await requireAuth(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }
  if (!hasRole(auth.session, "gestor")) {
    return res.status(403).json({ ok: false, error: "Apenas gestor/admin pode atualizar dados do motorista" });
  }

  const { agendamentoId, motoristaRe, motoristaPosto, motoristaNome, motoristaOpm, motoristaOpmCode, motoristaCnh, motoristaBoletim, motoristaDataProva, motoristaPublicacoes } = req.body || {};

  if (!agendamentoId) {
    return res.status(400).json({ ok: false, error: "agendamentoId eh obrigatorio" });
  }
  if (!motoristaNome || !motoristaPosto) {
    return res.status(400).json({ ok: false, error: "motoristaNome e motoristaPosto sao obrigatorios" });
  }

  const session = auth.session;
  const user = await getUserById(session.userId);
  if (!user) return res.status(404).json({ ok: false, error: "Usuario nao encontrado" });

  // Pega o agendamento
  const agRes = await sql`SELECT * FROM agendamentos WHERE id = ${agendamentoId} LIMIT 1`;
  const ag = agRes.rows[0];
  if (!ag) return res.status(404).json({ ok: false, error: "Agendamento nao encontrado" });

  if (!ag.motoristaRe) {
    return res.status(400).json({ ok: false, error: "Agendamento sem RE de motorista. Cancelar e recriar." });
  }

  // FIX (William 2026-09-04 v2): GESTOR consulta SAT em QUALQUER caso
  // (independente de o solicitante ser o motorista ou nao).
  // Nao precisa checar mais solicitanteMotorista aqui.

  // RLS: gestor soh pode atualizar agendamentos da sua unidade (ou admin tudo)
  if (user.viaturasRole !== "admin" && !user.isMaster) {
    const unidadesAutorizadas = parseArr(user.unidadesGestor);
    if (!unidadesAutorizadas || !unidadesAutorizadas.includes(ag.unidadeRequerente)) {
      return res.status(403).json({ ok: false, error: "Sem permissao pra atualizar agendamento dessa unidade" });
    }
  }

  const ts = now();
  await sql`
    UPDATE agendamentos SET
      motoristaRe = ${motoristaRe || ag.motoristaRe},
      motoristaPosto = ${motoristaPosto},
      motoristaNome = ${motoristaNome},
      motoristaOpm = ${motoristaOpm || null},
      motoristaOpmCode = ${motoristaOpmCode || null},
      motoristaCnh = ${motoristaCnh || null},
      motoristaBoletim = ${motoristaBoletim || null},
      motoristaDataProva = ${motoristaDataProva || null},
      motoristaPublicacoes = ${motoristaPublicacoes ? JSON.stringify(motoristaPublicacoes) : null},
      atualizadoEm = ${ts}
    WHERE id = ${agendamentoId}
  `;

  // Audit log
  await sql`
    INSERT INTO auditLog (userId, cpf, action, resource, resourceId, dataHora)
    VALUES (${user.id}, ${user.cpf}, 'agendamento.atualizar_motorista', 'agendamento', ${String(agendamentoId)}, ${ts})
  `;

  return res.status(200).json({ ok: true });
}

function parseArr(val: any): number[] {
  if (Array.isArray(val)) return val;
  if (typeof val === "string") { try { return JSON.parse(val); } catch { return []; } }
  return [];
}
