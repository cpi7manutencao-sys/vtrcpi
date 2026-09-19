// ============================================================
// POST /api/units/update
// Atualiza OPM existente. RLS igual create.
// Clone de convex/units.ts:update
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql, now } from "../_lib/db";
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
  if (!body.id) {
    return res.status(400).json({ ok: false, error: "id obrigatorio" });
  }

  const session = auth.session;
  const user = await getUserById(session.userId);
  if (!user) return res.status(404).json({ ok: false, error: "Usuario nao encontrado" });
  const isAdmin = isMasterUser(user) || user.viaturasRole === "admin";
  if (!isAdmin && user.viaturasRole !== "gestor") {
    return res.status(403).json({ ok: false, error: "Sem permissao para editar OPM" });
  }

  const unit = await sql`SELECT * FROM units WHERE id = ${body.id} LIMIT 1`;
  if (!unit.rows[0]) return res.status(404).json({ ok: false, error: "OPM nao encontrada" });

  // Gestor: precisa que a OPM seja filha das unidades autorizadas
  if (!isAdmin) {
    const unidadesAutorizadas = await getUserUnidadesAutorizadas(parseArr(user.unidadesGestor));
    if (!unit.rows[0].parentUnit || !unidadesAutorizadas.includes(unit.rows[0].parentUnit)) {
      return res.status(403).json({ ok: false, error: "Gestor so pode editar OPMs filhas das suas unidades autorizadas." });
    }
    // Gestor NAO pode mexer em commandUnit
    if (body.commandUnit !== undefined &&
        body.commandUnit?.toString() !== unit.rows[0].commandUnit?.toString()) {
      return res.status(403).json({ ok: false, error: "Gestor nao pode alterar o Comando (funcional). Apenas admin pode mexer." });
    }
  }

  // Auto-referencia check
  if (body.parentUnit && body.parentUnit.toString() === body.id.toString()) {
    return res.status(400).json({ ok: false, error: "A unidade nao pode ser pai de si mesma." });
  }

  const patch: any = {};
  if (body.name !== undefined) patch.name = body.name.trim();
  if (body.sigla !== undefined) patch.sigla = body.sigla?.trim() || null;
  if (body.parentUnit !== undefined) patch.parentUnit = body.parentUnit;
  if (body.commandUnit !== undefined) patch.commandUnit = body.commandUnit;
  if (body.active !== undefined) patch.active = body.active ? 1 : 0;

  if (Object.keys(patch).length === 0) {
    return res.status(200).json({ ok: true, id: body.id, unchanged: true });
  }

  // ConstrÃ³i UPDATE dinamico
  const sets = Object.keys(patch).map(k => `${k} = ?`).join(", ");
  const vals = Object.values(patch);
  await query(`UPDATE units SET ${sets} WHERE id = ?`, [...vals, body.id]);

  return res.status(200).json({ ok: true, id: body.id, patched: Object.keys(patch) });
}

function parseArr(val: any): number[] {
  if (Array.isArray(val)) return val;
  if (typeof val === "string") { try { return JSON.parse(val); } catch { return []; } }
  return [];
}
