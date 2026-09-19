// ============================================================
// POST /api/viaturas/upsert
// Cria ou atualiza viatura (upsert por prefixo).
// So editor/admin pode. RLS: user precisa acessar a unidade.
// Clone de convex/viaturas.ts:upsert
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql, now } from "../_lib/db";
import { requireAuth } from "../_lib/auth";
import { getUserById, userPodeAcessarUnidade } from "../_lib/agendamentos-helpers";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const auth = await requireAuth(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }

  const body = req.body || {};
  const required = ["opm", "prefixo", "tipo", "categoria", "marcaModelo", "ativo"];
  for (const f of required) {
    if (body[f] === undefined || body[f] === null) {
      return res.status(400).json({ ok: false, error: `Campo obrigatorio: ${f}` });
    }
  }

  const session = auth.session;
  const user = await getUserById(session.userId);
  if (!user) return res.status(404).json({ ok: false, error: "Usuario nao encontrado" });
  if (user.viaturasRole !== "editor" && user.viaturasRole !== "admin" && !user.isMaster) {
    return res.status(403).json({ ok: false, error: "Sem permissao para editar viatura" });
  }

  // RLS
  if (user.viaturasRole !== "admin" && !user.isMaster) {
    const temAcesso = await userPodeAcessarUnidade(user, body.opm);
    if (!temAcesso) {
      return res.status(403).json({ ok: false, error: "Sem permissao pra editar viatura dessa unidade" });
    }
  }

  // Validacao de unicidade de PLACA
  if (body.placa) {
    const placaNorm = String(body.placa).trim().toUpperCase();
    if (placaNorm) {
      const placaExist = await sql`SELECT id, prefixo, marcaModelo FROM viaturas WHERE UPPER(placa) = ${placaNorm} LIMIT 1`;
      if (placaExist.rows[0] && placaExist.rows[0].id !== body.id) {
        return res.status(400).json({
          ok: false,
          error: `Placa '${placaNorm}' ja cadastrada na viatura ${placaExist.rows[0].prefixo}`,
        });
      }
    }
  }

  // Verifica se ja existe por prefixo
  const existing = await sql`SELECT id FROM viaturas WHERE prefixo = ${body.prefixo} LIMIT 1`;
  const ts = now();

  if (existing.rows[0]) {
    // UPDATE
    const id = existing.rows[0].id;
    await sql`
      UPDATE viaturas SET
        opm = ${body.opm}, tipo = ${body.tipo}, categoria = ${body.categoria},
        marcaModelo = ${body.marcaModelo}, ativo = ${body.ativo ? 1 : 0},
        dataBaixa = ${body.dataBaixa || null}, motivo = ${body.motivo || null},
        situacao = ${body.situacao || null}, observacao = ${body.observacao || null},
        placa = ${body.placa || null}, patrimonio = ${body.patrimonio || null},
        cadConv = ${body.cadConv || null}, anoFab = ${body.anoFab || null},
        valor = ${body.valor || null}, nl = ${body.nl || null},
        contaPatrimonial = ${body.contaPatrimonial || null}, local = ${body.local || null},
        atualizadoEm = ${ts}, atualizadoPor = ${user.id}
      WHERE id = ${id}
    `;
    return res.status(200).json({ ok: true, id, created: false });
  } else {
    // INSERT
    const r = await sql`
      INSERT INTO viaturas (
        opm, prefixo, tipo, categoria, marcaModelo, ativo,
        dataBaixa, motivo, situacao, observacao,
        placa, patrimonio, cadConv, anoFab, valor, nl, contaPatrimonial, local,
        criadoEm, criadoPor
      ) VALUES (
        ${body.opm}, ${body.prefixo}, ${body.tipo}, ${body.categoria}, ${body.marcaModelo}, ${body.ativo ? 1 : 0},
        ${body.dataBaixa || null}, ${body.motivo || null}, ${body.situacao || null}, ${body.observacao || null},
        ${body.placa || null}, ${body.patrimonio || null}, ${body.cadConv || null}, ${body.anoFab || null},
        ${body.valor || null}, ${body.nl || null}, ${body.contaPatrimonial || null}, ${body.local || null},
        ${ts}, ${user.id}
      )
    `;
    // Pega o ID recem-inserido (SQLite: last_insert_rowid)
    const idRes = await sql`SELECT last_insert_rowid() as id`;
    const id = (idRes.rows[0] as any)?.id;
    return res.status(200).json({ ok: true, id, created: true });
  }
}
