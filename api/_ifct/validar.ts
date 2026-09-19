// ============================================================
// POST /api/ifct/validar
// Gestor valida (ou NEGA) o IFCT preenchido pelo motorista.
// v58 (William 2026-09-14): aceita body {aprovar: boolean, justificativa?: string}
// - Se aprovar=true: ifctStatus='validado' + status='concluido'
// - Se aprovar=false: ifctStatus volta pra 'pendente' (motorista pode refazer)
//   + salva justificativa + dispara email pro motorista com link ICT
// Clone de convex/ifct.ts:validarIfct
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql, now } from "../_lib/db";
import { requireAuth, hasRole } from "../_lib/auth";
import { getUserById, getUserUnidadesAutorizadas } from "../_lib/agendamentos-helpers";
import { sendEmail, isMailerConfigured } from "../_lib/mailer";
import { ictRejeitadoEmail } from "../_lib/email-templates";

function formatDateBR(ts: number | string | null | undefined): string {
  if (!ts) return "";
  const d = new Date(typeof ts === "string" ? parseInt(ts) : ts);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-BR");
}
function formatDateTimeBR(ts: number | string | null | undefined): string {
  if (!ts) return "";
  const d = new Date(typeof ts === "string" ? parseInt(ts) : ts);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR");
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

  const { agendamentoId, observacao, aprovar, justificativa } = req.body || {};
  if (!agendamentoId) {
    return res.status(400).json({ ok: false, error: "agendamentoId obrigatorio" });
  }
  // FIX (William 2026-09-14 v58): quando NAO tem 'aprovar' no body, eh o
  // comportamento legado (aprova direto). Quando tem, segue a nova logica.
  const isAprovar = aprovar === undefined ? true : !!aprovar;
  if (!isAprovar && (!justificativa || !justificativa.trim())) {
    return res.status(400).json({ ok: false, error: "Pra NEGAR o ICT, informe a justificativa" });
  }

  const user = await getUserById(auth.session.userId);
  if (!user) return res.status(404).json({ ok: false, error: "Usuario nao encontrado" });

  const agRes = await sql`SELECT * FROM agendamentos WHERE id = ${agendamentoId} LIMIT 1`;
  const ag = agRes.rows[0];
  if (!ag) return res.status(404).json({ ok: false, error: "Agendamento nao encontrado" });
  if (ag.ifctStatus !== "preenchido") {
    return res.status(400).json({ ok: false, error: "IFCT ainda nao foi preenchido pelo motorista" });
  }

  // FIX (William 2026-09-16 v77): gestor so pode validar ICT de
  // agendamentos das suas unidades (recurso ou viatura atribuida).
  if (user.viaturasRole === "gestor") {
    const unidadesAutorizadas = await getUserUnidadesAutorizadas(
      typeof user.unidadesGestor === "string" ? JSON.parse(user.unidadesGestor || "[]") : (user.unidadesGestor || [])
    );
    let podeValidar = ag.unidadeRequerente && unidadesAutorizadas.includes(ag.unidadeRequerente);
    if (!podeValidar && ag.viaturaAtribuida) {
      const vtrRes = await sql`SELECT opm FROM viaturas WHERE id = ${ag.viaturaAtribuida} LIMIT 1`;
      const vtrOpm = vtrRes.rows[0]?.opm;
      podeValidar = vtrOpm && unidadesAutorizadas.includes(vtrOpm);
    }
    if (!podeValidar) {
      return res.status(403).json({ ok: false, error: "Sem permissao para validar ICT deste agendamento" });
    }
  }

  const agora = now();

  if (isAprovar) {
    // APROVAR: ifctStatus=validado, status=concluido, salva observacao (opcional)
    await sql`UPDATE agendamentos
      SET ifctStatus='validado',
          ifctValidadoPor=${user.id},
          ifctValidadoEm=${agora},
          ifctValidadoObservacao=${observacao || null},
          status='concluido',
          concluidoPor=${user.id},
          concluidoEm=${agora},
          atualizadoEm=${agora}
      WHERE id=${agendamentoId}`;
    return res.status(200).json({ ok: true, acao: "aprovado" });
  }

  // NEGAR: volta ifctStatus pra 'pendente', salva justificativa, manda email
  // pro motorista com link ICT pra refazer. NAO muda status do agendamento
  // (continua 'aprovado' - o gestor pode tentar validar de novo depois).
  await sql`UPDATE agendamentos
    SET ifctStatus='pendente',
        ifctValidadoPor=${user.id},
        ifctValidadoEm=${agora},
        ifctValidadoObservacao=${(justificativa || "").trim()},
        atualizadoEm=${agora}
    WHERE id=${agendamentoId}`;

  // Dispara email pro motorista
  let emailResult: { ok: boolean; error?: string } | null = null;
  if (isMailerConfigured() && ag.linkIfct) {
    try {
      const solRes = await sql`SELECT id, postoGraduacao, warName, name, email FROM users WHERE id = ${ag.solicitante} LIMIT 1`;
      const motoristaRes = await sql`SELECT postoGraduacao, warName, name, email FROM users WHERE id = ${ag.solicitante} LIMIT 1`;
      const sol = solRes.rows[0];

      if (sol && sol.email) {
        const appBase = (process.env.APP_BASE_URL || "http://localhost:5174").replace(/\/+$/, "");
        const linkIfctFull = `${appBase}/#/ifct/${ag.linkIfct}`;
        const tpl = ictRejeitadoEmail({
          motoristaPosto: ag.motoristaPosto || motoristaRes.rows[0]?.postoGraduacao || "",
          motoristaNome: ag.motoristaNome || motoristaRes.rows[0]?.warName || motoristaRes.rows[0]?.name || "Motorista",
          gestorPosto: user.postoGraduacao || "",
          gestorNome: user.warName || user.name || "Gestor",
          agendamentoId: ag.id,
          dataMissao: formatDateBR(ag.dataMissao),
          destino: ag.destino || "—",
          justificativa: (justificativa || "").trim(),
          linkIfct: linkIfctFull,
          validadoEm: formatDateTimeBR(agora),
        });
        emailResult = await sendEmail({
          to: sol.email,
          subject: tpl.subject,
          text: tpl.text,
          html: tpl.html,
          replyTo: user.email || undefined,
        });
      } else {
        emailResult = { ok: false, error: "solicitante sem email" };
      }
    } catch (e: any) {
      emailResult = { ok: false, error: e.message };
    }
  }

  return res.status(200).json({
    ok: true,
    acao: "negado",
    emailEnviado: emailResult?.ok || false,
    emailErro: emailResult?.ok ? undefined : emailResult?.error,
  });
}
