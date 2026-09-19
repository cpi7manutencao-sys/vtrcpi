// ============================================================
// POST /api/users/promote
// Admin master promove/reatroa user (muda role, unidades, escopo)
// Header: Authorization: Bearer <jwt>
// Body (v65 - nova hierarquia):
//   { userId, viaturasRole, matrizId, filhasIds?, unidadesGestor?, unidadesEditor?, escopo?, unitId? }
// Onde:
//   - matrizId: ID da matriz do usuario (obrigatorio se muda unidades)
//   - filhasIds: opcional. Se null/vazio, backend expande recursivamente
//                 toda a matriz. Se preenchido, cada ID eh uma raiz que
//                 expande recursivamente seus descendentes.
// Apenas isMaster (William) pode usar
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql, now } from "../_lib/db";
import { requireAuth } from "../_lib/auth";
import { audit } from "../_lib/audit";
import { resolveAuthorizedUnits } from "../_lib/hierarquia";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const auth = await requireAuth(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }
  if (!auth.session.isMaster) {
    return res.status(403).json({ ok: false, error: "Apenas isMaster pode promover" });
  }

  const { userId, viaturasRole, matrizId, filhasIds, unidadesGestor, unidadesEditor, escopo, unitId } = req.body || {};
  if (!userId) {
    return res.status(400).json({ ok: false, error: "userId obrigatorio" });
  }
  if (viaturasRole && !["viewer", "editor", "gestor", "admin"].includes(viaturasRole)) {
    return res.status(400).json({ ok: false, error: "viaturasRole invalido" });
  }
  if (escopo && !["livre", "restrito"].includes(escopo)) {
    return res.status(400).json({ ok: false, error: "escopo invalido" });
  }

  const userResult = await sql`SELECT * FROM users WHERE id = ${userId}`;
  if (userResult.rows.length === 0) {
    return res.status(404).json({ ok: false, error: "Usuario nao encontrado" });
  }

  // FIX (William 2026-09-14 v65): se recebeu matrizId + filhasIds, calcula
  // a lista final de unidades autorizadas (recursivamente, via commandUnit).
  // Salva em unidadesGestor E unidadesEditor.
  let resolvedUnits: number[] | null = null;
  if (matrizId !== undefined && matrizId !== null) {
    const unitsRes = await sql`SELECT id, commandUnit FROM units`;
    const unitsLite = unitsRes.rows.map((r: any) => ({ id: r.id, commandUnit: r.commandUnit }));
    resolvedUnits = [...resolveAuthorizedUnits(unitsLite, matrizId, filhasIds)];
    console.log(`[promote] userId=${userId} matriz=${matrizId} filhasSelecionadas=${filhasIds?.length || 0} -> resolved=${resolvedUnits.length} unidades`);
  }

  await sql`UPDATE users SET promotedAt = ${now()}, approved = 1, active = 1 WHERE id = ${userId}`;
  if (viaturasRole !== undefined) {
    await sql`UPDATE users SET viaturasRole = ${viaturasRole} WHERE id = ${userId}`;
  }
  if (resolvedUnits !== null) {
    await sql`UPDATE users SET unit = ${matrizId} WHERE id = ${userId}`;
    await sql`UPDATE users SET unidadesGestor = ${JSON.stringify(resolvedUnits)} WHERE id = ${userId}`;
    await sql`UPDATE users SET unidadesEditor = ${JSON.stringify(resolvedUnits)} WHERE id = ${userId}`;
  } else {
    // Modo legado: aceita unidadesGestor/unidadesEditor/unitId diretos
    if (unidadesGestor !== undefined) {
      await sql`UPDATE users SET unidadesGestor = ${JSON.stringify(unidadesGestor)} WHERE id = ${userId}`;
    }
    if (unidadesEditor !== undefined) {
      await sql`UPDATE users SET unidadesEditor = ${JSON.stringify(unidadesEditor)} WHERE id = ${userId}`;
    }
    if (unitId !== undefined) {
      if (unitId === null) {
        await sql`UPDATE users SET unit = NULL WHERE id = ${userId}`;
      } else {
        await sql`UPDATE users SET unit = ${unitId} WHERE id = ${userId}`;
      }
    }
  }
  if (escopo !== undefined) {
    await sql`UPDATE users SET escopo = ${escopo} WHERE id = ${userId}`;
  }

  await audit(
    auth.session.userId,
    auth.session.cpf,
    "user.promote",
    "user",
    String(userId),
    { viaturasRole, matrizId, filhasIds, resolvedUnits, escopo },
    req
  );

  return res.status(200).json({
    ok: true,
    message: "Usuario atualizado",
    resolvedUnits: resolvedUnits ?? undefined,
  });
}
