// DEBUG: dump user cru do DB pra ver os nomes das colunas
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "../lib/db";
import { requireAuth } from "../lib/auth";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ ok: false });
  const auth = await requireAuth(req);
  if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

  const r = await sql`SELECT * FROM users WHERE id = ${auth.session.userId}`;
  const user = r.rows[0];
  return res.status(200).json({
    ok: true,
    columns: Object.keys(user || {}),
    user: user || null,
  });
}
