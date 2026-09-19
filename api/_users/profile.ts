// ============================================================
// POST /api/users/profile
// User NOVO completa seu cadastro (CPF, RE, nome guerra, posto, unidade)
// Header: Authorization: Bearer <jwt>
// Body: { cpf, re, digre, warName, postoGraduacao, codptgr, unitId (opcional) }
// User PRECISA estar logado (Google) mas NÃO precisa estar approved
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql, now } from "../_lib/db";
import { requireAuth } from "../_lib/auth";
import { signSession } from "../_lib/jwt";
import { audit } from "../_lib/audit";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const auth = await requireAuth(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }

  const {
    cpf,
    re,
    digre,
    warName,
    postoGraduacao,
    codptgr,
    unitId,
    opmCode,
    sexo,
    dataNascimento,
    telefone,
  } = req.body || {};

  // Validações
  if (!cpf || cpf.length !== 11) {
    return res.status(400).json({ ok: false, error: "CPF inválido (11 dígitos)" });
  }
  if (!re) {
    return res.status(400).json({ ok: false, error: "RE obrigatório" });
  }
  if (!warName) {
    return res.status(400).json({ ok: false, error: "Nome de guerra obrigatório" });
  }
  if (!postoGraduacao) {
    return res.status(400).json({ ok: false, error: "Posto/Graduação obrigatório" });
  }
  // unitId é opcional - se não vier, gestor define depois na aprovação

  // Limpar CPF (só dígitos)
  const cpfClean = String(cpf).replace(/\D/g, "");
  if (cpfClean.length !== 11) {
    return res.status(400).json({ ok: false, error: "CPF deve ter 11 dígitos" });
  }

  // Checar se CPF já existe em outro user
  const cpfCheck = await sql`
    SELECT id FROM users WHERE cpf = ${cpfClean} AND id != ${auth.session.userId}
  `;
  if (cpfCheck.rows.length > 0) {
    return res.status(409).json({ ok: false, error: "CPF já cadastrado por outro usuário" });
  }

  // Atualizar (FIX William 2026-09-10 v41: schema eh camelCase)
  await sql`
    UPDATE users SET
      cpf = ${cpfClean},
      re = ${re},
      digre = ${digre || null},
      warName = ${warName},
      postoGraduacao = ${postoGraduacao},
      codptgr = ${codptgr || null},
      unit = ${unitId || null},
      opmCode = ${opmCode || null},
      sexo = ${sexo || null},
      dataNascimento = ${dataNascimento || null},
      telefone = ${telefone || null}
    WHERE id = ${auth.session.userId}
  `;

  // Recarregar user
  const userResult = await sql`SELECT * FROM users WHERE id = ${auth.session.userId}`;
  const user = userResult.rows[0];

  // Novo JWT com dados atualizados (FIX William 2026-09-10 v41: schema camelCase)
  const token = await signSession({
    googleId: auth.session.googleId,
    email: user.email,
    name: user.name,
    picture: user.picture,
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
    user.id,
    user.cpf,
    "user.profile",
    "user",
    String(user.id),
    { cpf: cpfClean, re },
    req
  );

  return res.status(200).json({
    ok: true,
    token,
    session: {
      userId: user.id,
      cpf: user.cpf,
      re: user.re,
      warName: user.warName,
      postoGraduacao: user.postoGraduacao,
      unitId: user.unit,
      approved: user.approved,
      isMaster: user.isMaster,
      viaturasRole: user.viaturasRole,
    },
  });
}

// Helper pra parsear array JSON
function parseJsonArray(v: any): any[] {
  if (Array.isArray(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; }
  }
  return [];
}
