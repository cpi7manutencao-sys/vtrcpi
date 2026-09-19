// ============================================================
// POST /api/agendamentos/editar-odometro
// Edita odometro de agendamento. So gestor/admin.
// Clone de convex/agendamentos.ts:editarOdometro
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql, now } from "../_lib/db";
import { requireAuth } from "../_lib/auth";
import { getUserById } from "../_lib/agendamentos-helpers";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const auth = await requireAuth(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }

  const { agendamentoId, tipo, novoOdometro } = req.body || {};
  if (!agendamentoId || !tipo || typeof novoOdometro !== "number") {
    return res.status(400).json({ ok: false, error: "agendamentoId, tipo (retirada|devolucao) e novoOdometro sao obrigatorios" });
  }
  if (novoOdometro < 0) {
    return res.status(400).json({ ok: false, error: "Odometro invalido (deve ser >= 0)" });
  }
  if (tipo !== "retirada" && tipo !== "devolucao") {
    return res.status(400).json({ ok: false, error: "tipo deve ser 'retirada' ou 'devolucao'" });
  }

  const session = auth.session;
  const user = await getUserById(session.userId);
  if (!user) return res.status(404).json({ ok: false, error: "Usuario nao encontrado" });
  if (user.viaturasRole !== "gestor" && user.viaturasRole !== "admin" && !user.isMaster) {
    return res.status(403).json({ ok: false, error: "Sem permissao para editar odometro" });
  }

  const agRes = await sql`SELECT * FROM agendamentos WHERE id = ${agendamentoId} LIMIT 1`;
  const ag = agRes.rows[0];
  if (!ag) return res.status(404).json({ ok: false, error: "Agendamento nao encontrado" });

  const ts = now();
  if (tipo === "retirada") {
    if (ag.odometroDevolucao != null && novoOdometro > ag.odometroDevolucao) {
      return res.status(400).json({
        ok: false,
        error: "Odometro de retirada (" + novoOdometro + ") maior que o de devolucao (" + ag.odometroDevolucao + "). Verifique.",
      });
    }
    const kmRodados = ag.odometroDevolucao != null ? ag.odometroDevolucao - novoOdometro : ag.kmRodados;
    await sql`
      UPDATE agendamentos
      SET odometroRetirada = ${novoOdometro}, odometroRetiradaEm = ${ts},
          odometroRetiradaPor = ${user.id}, kmRodados = ${kmRodados},
          odometroEditado = 1, atualizadoEm = ${ts}
      WHERE id = ${agendamentoId}
    `;
  } else {
    if (ag.odometroRetirada == null) {
      return res.status(400).json({ ok: false, error: "Sem odometro de retirada pra comparar" });
    }
    if (novoOdometro < ag.odometroRetirada) {
      return res.status(400).json({
        ok: false,
        error: "Odometro de devolucao (" + novoOdometro + ") menor que o de retirada (" + ag.odometroRetirada + "). Verifique.",
      });
    }
    const kmRodados = novoOdometro - ag.odometroRetirada;
    await sql`
      UPDATE agendamentos
      SET odometroDevolucao = ${novoOdometro}, odometroDevolucaoEm = ${ts},
          odometroDevolucaoPor = ${user.id}, kmRodados = ${kmRodados},
          odometroEditado = 1, atualizadoEm = ${ts}
      WHERE id = ${agendamentoId}
    `;
  }

  return res.status(200).json({ ok: true });
}
