// ============================================================
// POST /api/users/update-me
// O PROPRIO usuario edita seus dados pessoais (warName, postoGraduacao, telefone).
// Header: Authorization: Bearer <jwt>
// Body: { warName?, postoGraduacao?, telefone?, codptgr? }
//
// FIX (William 2026-09-20): usuarios comuns devem conseguir editar seus dados
// na Home. Apenas campos pessoais (NAO pode mudar CPF, RE, role, unidades -
// isso eh papel do admin).
// Retorna novo JWT com dados atualizados.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql, query } from "../lib/db";
import { requireAuth } from "../lib/auth";
import { signSession } from "../lib/jwt";
import { audit } from "../lib/audit";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const auth = await requireAuth(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }

  const session = auth.session;
  const {
    warName,
    postoGraduacao,
    codptgr,
    telefone,
    name,
  } = req.body || {};

  // Validacoes basicas
  if (warName !== undefined && (!warName || String(warName).trim().length === 0)) {
    return res.status(400).json({ ok: false, error: "Nome de guerra nao pode ser vazio" });
  }
  if (postoGraduacao !== undefined && (!postoGraduacao || String(postoGraduacao).trim().length === 0)) {
    return res.status(400).json({ ok: false, error: "Posto/Graduacao nao pode ser vazio" });
  }
  if (name !== undefined && (!name || String(name).trim().length === 0)) {
    return res.status(400).json({ ok: false, error: "Nome nao pode ser vazio" });
  }
  // telefone opcional - validar formato basico se vier
  if (telefone !== undefined && telefone !== null && telefone !== "") {
    const telStr = String(telefone).replace(/\D/g, "");
    if (telStr.length < 10 || telStr.length > 11) {
      return res.status(400).json({ ok: false, error: "Telefone deve ter 10 ou 11 digitos" });
    }
  }

  const updates: string[] = [];
  const params: any[] = [];
  let pIdx = 1;

  if (warName !== undefined) {
    updates.push(`warName = $${pIdx++}`);
    params.push(String(warName).trim());
  }
  if (postoGraduacao !== undefined) {
    updates.push(`postoGraduacao = $${pIdx++}`);
    params.push(String(postoGraduacao).trim());
  }
  if (codptgr !== undefined) {
    updates.push(`codptgr = $${pIdx++}`);
    params.push(codptgr || null);
  }
  if (telefone !== undefined) {
    updates.push(`telefone = $${pIdx++}`);
    params.push(telefone || null);
  }
  if (name !== undefined) {
    updates.push(`name = $${pIdx++}`);
    params.push(String(name).trim());
  }

  if (updates.length === 0) {
    return res.status(400).json({ ok: false, error: "Nenhum campo para atualizar" });
  }

  params.push(session.userId);
  const sqlFinal = `UPDATE users SET ${updates.join(", ")} WHERE id = $${pIdx} RETURNING *`;
  const result = await query(sqlFinal, params);
  const user = result.rows[0];

  if (!user) {
    return res.status(404).json({ ok: false, error: "Usuario nao encontrado" });
  }

  // Novo JWT com dados atualizados
  const token = await signSession({
    googleId: session.googleId,
    email: session.email,
    name: user.name,
    picture: session.picture,
    userId: user.id,
    cpf: user.cpf,
    re: user.re,
    warName: user.warName,
    postoGraduacao: user.postoGraduacao,
    unitId: user.unit,
    unitCode: user.opmCode,
    role: user.role,
    viaturasRole: user.viaturasRole,
    unidadesGestor: parseJsonArray(user.unidadesGestor),
    unidadesEditor: parseJsonArray(user.unidadesEditor),
    approved: user.approved,
    isMaster: user.isMaster,
    escopo: user.escopo || "restrito",
  });

  await audit(
    session.userId,
    session.cpf,
    "user.update_me",
    "user",
    String(session.userId),
    { warName, postoGraduacao, telefone, name },
    req
  );

  return res.status(200).json({
    ok: true,
    token,
    session: {
      userId: user.id,
      cpf: user.cpf,
      re: user.re,
      name: user.name,
      warName: user.warName,
      postoGraduacao: user.postoGraduacao,
      telefone: user.telefone,
      unitId: user.unit,
      approved: user.approved,
      isMaster: user.isMaster,
      viaturasRole: user.viaturasRole,
    },
  });
}

function parseJsonArray(v: any): any[] {
  if (Array.isArray(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; }
  }
  return [];
}
