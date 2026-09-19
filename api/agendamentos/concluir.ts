// ============================================================
// POST /api/agendamentos/concluir
// Marca agendamento como concluido. OBRIGATORIO odometroDevolucao.
// Calcula kmRodados = devolucao - retirada.
// Clone de convex/agendamentos.ts:concluir
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

  const { agendamentoId, odometroDevolucao, naoCompareceu } = req.body || {};
  if (!agendamentoId) {
    return res.status(400).json({ ok: false, error: "agendamentoId eh obrigatorio" });
  }
  // FIX (William 2026-09-07 v2): odometroDevolucao agora eh OPCIONAL
  // (motorista preenche no encerramento do IFCT, nao mais o gestor na conclusao)
  if (odometroDevolucao !== undefined && (typeof odometroDevolucao !== "number" || odometroDevolucao < 0)) {
    return res.status(400).json({ ok: false, error: "odometroDevolucao (se informado) deve ser >= 0" });
  }

  const session = auth.session;
  const user = await getUserById(session.userId);
  if (!user) return res.status(404).json({ ok: false, error: "Usuario nao encontrado" });

  const agRes = await sql`SELECT * FROM agendamentos WHERE id = ${agendamentoId} LIMIT 1`;
  const ag = agRes.rows[0];
  if (!ag) return res.status(404).json({ ok: false, error: "Agendamento nao encontrado" });
  if (ag.status !== "aprovado" && ag.status !== "concluido") {
    return res.status(400).json({ ok: false, error: "Agendamento nao pode ser concluido (status=" + ag.status + ")" });
  }

  // FIX (William 2026-09-07 v2): odometros sao OPCIONAIS agora
  // (motorista preenche no encerramento do IFCT, nao mais o gestor na conclusao)
  let kmRodados: number | null = null;
  const odometroDevolucaoValue = typeof odometroDevolucao === "number" ? odometroDevolucao : null;
  if (typeof odometroDevolucao === "number" && typeof ag.odometroRetirada === "number") {
    if (odometroDevolucao < ag.odometroRetirada) {
      return res.status(400).json({
        ok: false,
        error: "Odometro de devolucao (" + odometroDevolucao + ") eh menor que o de retirada (" + ag.odometroRetirada + "). Verifique o numero.",
      });
    }
    kmRodados = odometroDevolucao - ag.odometroRetirada;
  }

  const ts = now();
  // FIX (William 2026-09-07 v2): usa query() direto pra nao ter problema com template tag aninhado
  const setOdometro = typeof odometroDevolucao === "number"
    ? `, odometroDevolucao = ?, odometroDevolucaoEm = ?, odometroDevolucaoPor = ?`
    : "";
  const params: any[] = [user.id, ts, naoCompareceu ? 1 : 0, kmRodados, ts];
  if (typeof odometroDevolucao === "number") {
    params.push(odometroDevolucao, ts, user.id);
  }
  params.push(agendamentoId);
  // importa o query via ../_lib/db
  const { query } = await import("../_lib/db");
  await query(
    `UPDATE agendamentos
     SET status = 'concluido',
         concluidoPor = ?,
         concluidoEm = ?,
         naoCompareceu = ?,
         kmRodados = ?,
         atualizadoEm = ?${setOdometro}
     WHERE id = ?`,
    params
  );

  return res.status(200).json({ ok: true, kmRodados });
}
