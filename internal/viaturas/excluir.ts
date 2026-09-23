// ============================================================
// POST /api/viaturas/excluir
// Exclui DEFINITIVAMENTE uma viatura (hard delete).
// Usado apenas em "Processo de Descarga" (viatura ja em emDescarga=TRUE).
// Editor/Admin/Gestor/Master podem excluir (viatura ja foi marcada
// pra descarte pelo fluxo normal, exclusao eh apenas o "enterro final").
// Clone de convex/viaturas.ts:removeViatura
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "../lib/db";
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

  const body = req.body || {};
  const id = parseInt(String(body.id ?? body.viaturaId ?? 0), 10);
  if (!id) {
    return res.status(400).json({ ok: false, error: "id/viaturaId obrigatorio" });
  }

  const session = auth.session;
  const user = await getUserById(session.userId);
  if (!user) return res.status(404).json({ ok: false, error: "Usuario nao encontrado" });

  // FIX (William 2026-09-23): gestor tambem pode excluir viatura em descarga
  // (mesma logica do atribuir.ts / toggle-ativo.ts - gestor cobre a operacao)
  if (user.viaturasRole !== "editor" && user.viaturasRole !== "gestor"
      && user.viaturasRole !== "admin" && !user.isMaster) {
    return res.status(403).json({ ok: false, error: "Sem permissao para excluir viatura" });
  }

  // Verifica que a viatura existe e esta em descarga
  const vRes = await sql`SELECT id, prefixo, placa, emDescarga, ativo FROM viaturas WHERE id = ${id} LIMIT 1`;
  const v = vRes.rows[0];
  if (!v) return res.status(404).json({ ok: false, error: "Viatura nao encontrada" });

  if (!v.emDescarga) {
    return res.status(400).json({
      ok: false,
      error: "Viatura precisa estar em PROCESSO DE DESCARGA (emDescarga=TRUE) pra ser excluida. Use o botao 'Enviar para Descarga' antes.",
    });
  }

  // Limpa dados relacionados (ordem importa por FKs)
  try {
    // 1) Historico da viatura
    await sql`DELETE FROM viaturaHistorico WHERE viaturaId = ${id}`;
    // 2) Rondas (se houver)
    await sql`DELETE FROM rondas WHERE viaturaatribuida = ${id}`;
    // 3) IFCTs relacionados (abastecimento + encerramento)
    await sql`DELETE FROM ifctAbastecimentos WHERE agendamentoId IN (SELECT id FROM agendamentos WHERE viaturaatribuida = ${id})`;
    await sql`DELETE FROM ifctEncerramentos WHERE agendamentoId IN (SELECT id FROM agendamentos WHERE viaturaatribuida = ${id})`;
    // 4) Desvincula a viatura dos agendamentos (NAO deleta agendamentos pra preservar historico)
    await sql`UPDATE agendamentos SET viaturaatribuida = NULL WHERE viaturaatribuida = ${id}`;
    // 5) Finalmente, exclui a viatura
    await sql`DELETE FROM viaturas WHERE id = ${id}`;
  } catch (e: any) {
    console.error(`[excluir-viatura] erro ao excluir viatura ${id}:`, e?.message);
    return res.status(500).json({ ok: false, error: `Erro ao excluir: ${e?.message || 'desconhecido'}` });
  }

  return res.status(200).json({
    ok: true,
    id,
    message: `Viatura ${v.prefixo || v.placa || id} excluida definitivamente`,
  });
}
