// ============================================================
// POST /api/viaturas/toggle-ativo
// Toggle de ativo COM registro de historico.
// Quando muda true->false, registra evento "baixa".
// Quando muda false->true, registra evento "reativacao".
// Pega KM do ultimo agendamento concluido pra registrar.
// Clone de convex/viaturas.ts:toggleAtivo
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

  const { id, novoAtivo, motivo, situacao, observacao } = req.body || {};
  if (!id || typeof novoAtivo !== "boolean") {
    return res.status(400).json({ ok: false, error: "id e novoAtivo (boolean) sao obrigatorios" });
  }

  const session = auth.session;
  const user = await getUserById(session.userId);
  if (!user) return res.status(404).json({ ok: false, error: "Usuario nao encontrado" });
  if (user.viaturasRole !== "editor" && user.viaturasRole !== "admin" && user.viaturasRole !== "gestor" && !user.isMaster) {
    return res.status(403).json({ ok: false, error: "Sem permissao" });
  }

  const v = await sql`SELECT id, ativo FROM viaturas WHERE id = ${id} LIMIT 1`;
  if (!v.rows[0]) return res.status(404).json({ ok: false, error: "Viatura nao encontrada" });

  const ts = now();
  // Atualiza viatura
  await sql`
    UPDATE viaturas SET
      ativo = ${novoAtivo ? 1 : 0},
      dataBaixa = ${!novoAtivo ? ts : null},
      dataReativadoEm = ${novoAtivo ? ts : null},
      motivo = ${!novoAtivo ? (motivo || null) : null},
      situacao = ${!novoAtivo ? (situacao || null) : null},
      observacao = ${observacao || null},
      atualizadoEm = ${ts},
      atualizadoPor = ${user.id}
    WHERE id = ${id}
  `;

  // Pega KM do ultimo agendamento concluido (se houver)
  const ultRes = await sql`
    SELECT odometroDevolucao FROM agendamentos
    WHERE viaturaAtribuida = ${id} AND odometroDevolucao IS NOT NULL
    ORDER BY concluidoEm DESC LIMIT 1
  `;
  const km = ultRes.rows[0]?.odometroDevolucao || null;

  // Registra no historico
  await sql`
    INSERT INTO viaturaHistorico (viaturaId, tipo, dataHora, motivo, situacao, km, observacao, registradoPor)
    VALUES (${id}, ${novoAtivo ? "reativacao" : "baixa"}, ${ts}, ${motivo || null}, ${situacao || null}, ${km}, ${observacao || null}, ${user.id})
  `;

  return res.status(200).json({ ok: true, id, novoAtivo });
}
