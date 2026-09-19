// ============================================================
// GET /api/users/busca-por-re?re=XXXXXX
// PUBLIC (com auth) - busca policial pelo RE (6 digitos)
// Usado pelo IFCT mobile pra auto-preencher dados do motorista/encarregado
// quando o policial ja cadastrou antes (como motorista OU encarregado).
// Retorna: { ok, user: { postoGraduacao, warName, re, digre } } ou { ok, user: null }
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "../_lib/db";
import { requireAuth } from "../_lib/auth";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const auth = await requireAuth(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }

  const re = String(req.query.re || "").trim();
  if (!re) {
    return res.status(400).json({ ok: false, error: "re obrigatorio" });
  }

  // Busca em users (mira o RE de 6 digitos, com ou sem digito)
  // Prioriza cadastro completo (cpf preenchido)
  const result = await sql`
    SELECT id, postoGraduacao, warName, re, digre
    FROM users
    WHERE re = ${re}
    LIMIT 1
  `;

  const user = result.rows[0];
  if (!user) {
    return res.status(200).json({ ok: true, user: null });
  }

  return res.status(200).json({
    ok: true,
    user: {
      postoGraduacao: user.postoGraduacao || "",
      warName: user.warName || "",
      re: user.re || "",
      digre: user.digre || "",
    },
  });
}
