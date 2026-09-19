// ============================================================
// POST /api/units/create
// Cria nova OPM. Regras: admin (tudo) ou gestor (so filhas).
// Clone de convex/units.ts:create
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "../_lib/db";
import { requireAuth } from "../_lib/auth";
import { getUserById, getUserUnidadesAutorizadas, isMasterUser } from "../_lib/agendamentos-helpers";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const auth = await requireAuth(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }

  const body = req.body || {};
  if (!body.code || !body.name) {
    return res.status(400).json({ ok: false, error: "code e name sao obrigatorios" });
  }

  const codeClean = String(body.code).replace(/\D/g, "");
  if (codeClean.length < 6 || codeClean.length > 10) {
    return res.status(400).json({ ok: false, error: `Codigo SIAFEM invalido: "${body.code}". Esperado 6-10 digitos.` });
  }

  const session = auth.session;
  const user = await getUserById(session.userId);
  if (!user) return res.status(404).json({ ok: false, error: "Usuario nao encontrado" });

  const isAdmin = isMasterUser(user) || user.viaturasRole === "admin";

  if (!isAdmin && user.viaturasRole !== "gestor") {
    return res.status(403).json({ ok: false, error: "Sem permissao para criar OPM" });
  }

  // Gestor: parentUnit obrigatorio
  if (!isAdmin) {
    if (!body.parentUnit) {
      return res.status(400).json({ ok: false, error: "Gestor so pode criar OPMs filhas. Selecione a unidade-pai." });
    }
    const unidadesAutorizadas = await getUserUnidadesAutorizadas(parseArr(user.unidadesGestor));
    if (!unidadesAutorizadas.includes(body.parentUnit)) {
      return res.status(403).json({ ok: false, error: "Gestor nao pode criar OPM fora das suas unidades autorizadas." });
    }
  }

  // Verifica se ja existe
  const existing = await sql`SELECT id, name FROM units WHERE code = ${codeClean} LIMIT 1`;
  if (existing.rows[0]) {
    return res.status(400).json({ ok: false, error: `Ja existe uma OPM com o codigo ${codeClean}: ${existing.rows[0].name}` });
  }

  const r = await sql`INSERT INTO units (code, name, sigla, parentUnit, commandUnit, active)
    VALUES (${codeClean}, ${body.name.trim()}, ${body.sigla?.trim() || null}, ${body.parentUnit || null}, ${body.commandUnit || null}, 1)`;
  const idRes = await sql`SELECT last_insert_rowid() as id`;
  const id = (idRes.rows[0] as any)?.id;

  return res.status(200).json({ ok: true, id, code: codeClean, name: body.name });
}

function parseArr(val: any): number[] {
  if (Array.isArray(val)) return val;
  if (typeof val === "string") { try { return JSON.parse(val); } catch { return []; } }
  return [];
}
