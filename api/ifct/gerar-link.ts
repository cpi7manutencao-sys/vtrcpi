// ============================================================
// POST /api/ifct/gerar-link
// Gera link IFCT (UUID) para o agendamento. Idempotente (7d).
// Clone de convex/ifct.ts:gerarLinkIfct
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql, now } from "../_lib/db";
import { requireAuth, hasRole } from "../_lib/auth";
import { getUserById, getUserUnidadesAutorizadas } from "../_lib/agendamentos-helpers";

const LINK_EXPIRA_DIAS = 7;
const LINK_EXPIRA_MS = LINK_EXPIRA_DIAS * 24 * 60 * 60 * 1000;

function gerarUuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const auth = await requireAuth(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }
  if (!hasRole(auth.session, "gestor")) {
    return res.status(403).json({ ok: false, error: "Apenas gestor/admin" });
  }

  const { agendamentoId } = req.body || {};
  if (!agendamentoId) {
    return res.status(400).json({ ok: false, error: "agendamentoId obrigatorio" });
  }

  const user = await getUserById(auth.session.userId);
  if (!user) return res.status(404).json({ ok: false, error: "Usuario nao encontrado" });

  const agRes = await sql`SELECT * FROM agendamentos WHERE id = ${agendamentoId} LIMIT 1`;
  const ag = agRes.rows[0];
  if (!ag) return res.status(404).json({ ok: false, error: "Agendamento nao encontrado" });

  // RLS: gestor so pode gerar link para agendamentos das suas unidades
  // FIX (William 2026-09-16 v77): tambem permite se a viatura atribuida
  // for de uma unidade autorizada.
  if (user.viaturasRole === "gestor") {
    const unidadesAutorizadas = await getUserUnidadesAutorizadas(parseArr(user.unidadesGestor));
    let podeGerar = ag.unidadeRequerente && unidadesAutorizadas.includes(ag.unidadeRequerente);
    if (!podeGerar && ag.viaturaAtribuida) {
      const vtrRes = await sql`SELECT opm FROM viaturas WHERE id = ${ag.viaturaAtribuida} LIMIT 1`;
      const vtrOpm = vtrRes.rows[0]?.opm;
      podeGerar = vtrOpm && unidadesAutorizadas.includes(vtrOpm);
    }
    if (!podeGerar) {
      return res.status(403).json({ ok: false, error: "Sem permissao para este agendamento" });
    }
  }

  // Idempotente: se ja tem link valido (nao expirado), retorna o mesmo
  const agora = now();
  if (ag.linkIfct && ag.linkIfctExpiraEm && ag.linkIfctExpiraEm > agora && ag.ifctStatus !== "validado") {
    return res.status(200).json({
      ok: true,
      linkIfct: ag.linkIfct,
      linkIfctExpiraEm: ag.linkIfctExpiraEm,
      jaExistia: true,
    });
  }

  // Gera novo
  const linkIfct = gerarUuid();
  const linkIfctExpiraEm = agora + LINK_EXPIRA_MS;
  await sql`UPDATE agendamentos SET linkIfct=${linkIfct}, linkIfctExpiraEm=${linkIfctExpiraEm}, ifctStatus='pendente', atualizadoEm=${agora} WHERE id=${agendamentoId}`;

  return res.status(200).json({ ok: true, linkIfct, linkIfctExpiraEm, jaExistia: false });
}

function parseArr(val: any): number[] {
  if (Array.isArray(val)) return val;
  if (typeof val === "string") { try { return JSON.parse(val); } catch { return []; } }
  return [];
}
