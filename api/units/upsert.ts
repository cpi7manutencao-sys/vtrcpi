// ============================================================
// POST /api/units/upsert
// Cria ou atualiza unit por code.
// Clone de convex/units.ts:upsert
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "../_lib/db";
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

  const body = req.body || {};
  if (!body.code || !body.name) {
    return res.status(400).json({ ok: false, error: "code e name sao obrigatorios" });
  }

  const session = auth.session;
  const user = await getUserById(session.userId);
  if (!user || (user.viaturasRole !== "admin" && !user.isMaster)) {
    return res.status(403).json({ ok: false, error: "Apenas admin pode fazer upsert" });
  }

  const existing = await sql`SELECT id FROM units WHERE code = ${body.code} LIMIT 1`;
  const data = {
    code: body.code,
    name: body.name,
    sigla: body.sigla || null,
    parentUnit: body.parentUnit || null,
    active: body.active !== false ? 1 : 0,
  };

  if (existing.rows[0]) {
    await sql`UPDATE units SET name=${data.name}, sigla=${data.sigla}, parentUnit=${data.parentUnit}, active=${data.active} WHERE id=${existing.rows[0].id}`;
    return res.status(200).json({ ok: true, id: existing.rows[0].id, created: false });
  } else {
    const r = await sql`INSERT INTO units (code, name, sigla, parentUnit, active) VALUES (${data.code}, ${data.name}, ${data.sigla}, ${data.parentUnit}, ${data.active})`;
    const idRes = await sql`SELECT last_insert_rowid() as id`;
    return res.status(200).json({ ok: true, id: (idRes.rows[0] as any)?.id, created: true });
  }
}
