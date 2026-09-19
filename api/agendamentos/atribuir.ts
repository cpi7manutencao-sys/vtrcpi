// ============================================================
// POST /api/agendamentos/atribuir
// Atribui viatura a agendamento aprovado.
// Clone de convex/agendamentos.ts:atribuirViatura
//
// v54 (William 2026-09-14): apos atribuir a viatura, gera o linkIfct
// automaticamente (se nao existir) e dispara email pro SOLICITANTE
// com os dados da missao + link do ICT (era no approve.ts, mas William
// pediu pra mover pra ca - o email deve sair quando tudo estiver
// pronto: agendamento aprovado + viatura atribuida).
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql, now } from "../_lib/db";
import { requireAuth } from "../_lib/auth";
import { getUserById } from "../_lib/agendamentos-helpers";
import { sendEmail, isMailerConfigured } from "../_lib/mailer";
import { agendamentoAprovadoEmail } from "../_lib/email-templates";

const LINK_EXPIRA_DIAS = 7;
const LINK_EXPIRA_MS = LINK_EXPIRA_DIAS * 24 * 60 * 60 * 1000;

function gerarUuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

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

  const { agendamentoId, viaturaId, odometroRetirada } = req.body || {};
  if (!agendamentoId || !viaturaId) {
    return res.status(400).json({ ok: false, error: "agendamentoId e viaturaId sao obrigatorios" });
  }
  if (odometroRetirada !== undefined && (typeof odometroRetirada !== "number" || odometroRetirada < 0)) {
    return res.status(400).json({ ok: false, error: "odometroRetirada (se informado) deve ser >= 0" });
  }

  const session = auth.session;
  const user = await getUserById(session.userId);
  if (!user) return res.status(404).json({ ok: false, error: "Usuario nao encontrado" });
  if (user.viaturasRole !== "editor" && user.viaturasRole !== "admin" && !user.isMaster) {
    return res.status(403).json({ ok: false, error: "Sem permissao para atribuir viatura" });
  }

  const agRes = await sql`SELECT * FROM agendamentos WHERE id = ${agendamentoId} LIMIT 1`;
  const ag = agRes.rows[0];
  if (!ag) return res.status(404).json({ ok: false, error: "Agendamento nao encontrado" });
  if (ag.status !== "aprovado") {
    return res.status(400).json({ ok: false, error: "Agendamento nao esta aprovado" });
  }

  // FIX (William 2026-09-04 v2): o gestor SEMPRE precisa ter consultado o SAT
  // antes de atribuir a viatura (independente de quem eh o motorista).
  if (!ag.motoristaNome) {
    return res.status(400).json({
      ok: false,
      error: "O gestor precisa consultar o SAT do motorista (RE " + (ag.motoristaRe || "?") + ") antes de atribuir a viatura. Use o botao 'Consultar SAT Motorista'.",
    });
  }

  // Valida que a viatura existe
  const vtrRes = await sql`SELECT id, ativo FROM viaturas WHERE id = ${viaturaId} LIMIT 1`;
  if (!vtrRes.rows[0]) return res.status(404).json({ ok: false, error: "Viatura nao encontrada" });

  // FIX (William 2026-09-14 v59): verifica conflito de horario pra MESMA
  // viatura no mesmo dia. A regra de overlap (em string "HH:MM"):
  //   novo.retiradaHora < existente.devolucaoHora
  //   E novo.devolucaoHora > existente.retiradaHora
  // Considera apenas agendamentos com status 'aprovado' ou 'concluido'
  // (cancelados/rejeitados/pendentes nao bloqueiam).
  // Disponivel apenas quando o agendamento tem retiradaHora/devolucaoHora
  // (na maioria dos casos sim - vem do formulario de agendamento).
  //
  // FIX do FIX: dataMissao eh timestamp MS, nao data pura. 2 agendamentos
  // criados no mesmo dia em segundos diferentes tem dataMissao DIFERENTE.
  // Entao comparo por DIA (range [dayStart, dayEnd)).
  if (ag.retiradaHora && ag.devolucaoHora && ag.dataMissao) {
    const dayStart = new Date(ag.dataMissao);
    dayStart.setHours(0, 0, 0, 0);
    const dayStartMs = dayStart.getTime();
    const dayEndMs = dayStartMs + 86400000;
    const conflitoRes = await sql`
      SELECT id, postoGraduacao, nomeGuerra, retiradaHora, devolucaoHora,
             destino, status, dataMissao
      FROM agendamentos
      WHERE viaturaAtribuida = ${viaturaId}
        AND id != ${agendamentoId}
        AND status IN ('aprovado', 'concluido')
        AND dataMissao >= ${dayStartMs}
        AND dataMissao < ${dayEndMs}
        AND retiradaHora IS NOT NULL
        AND devolucaoHora IS NOT NULL
        AND retiradaHora < ${ag.devolucaoHora}
        AND devolucaoHora > ${ag.retiradaHora}
      LIMIT 1
    `;
    const conflito = conflitoRes.rows[0];
    if (conflito) {
      return res.status(409).json({
        ok: false,
        error: `Viatura ja' agendada em conflito de horario. Agendamento #${conflito.id} (${conflito.retiradaHora} - ${conflito.devolucaoHora}) - ${conflito.postoGraduacao} ${conflito.nomeGuerra} - destino: ${conflito.destino || '—'}. Escolha outra viatura ou ajuste o horario.`,
        conflito: {
          agendamentoId: conflito.id,
          postoGraduacao: conflito.postoGraduacao || "",
          nomeGuerra: conflito.nomeGuerra || "",
          retiradaHora: conflito.retiradaHora,
          devolucaoHora: conflito.devolucaoHora,
          destino: conflito.destino || "",
          status: conflito.status,
        },
      });
    }
  }

  const ts = now();
  await sql`
    UPDATE agendamentos
    SET viaturaAtribuida = ${viaturaId},
        odometroRetirada = ${typeof odometroRetirada === "number" ? odometroRetirada : null},
        odometroRetiradaEm = ${typeof odometroRetirada === "number" ? ts : null},
        odometroRetiradaPor = ${typeof odometroRetirada === "number" ? user.id : null},
        atualizadoEm = ${ts}
    WHERE id = ${agendamentoId}
  `;

  // ============================================================
  // v54 - GERAR linkIfct (se nao existir) e DISPARAR email
  // pro solicitante com link do ICT.
  // Email sai aqui (NAO no approve) pq agora a missao ja' tem
  // todos os dados: agendamento aprovado + viatura atribuida.
  // ============================================================

  const agUpdRes = await sql`SELECT * FROM agendamentos WHERE id = ${agendamentoId} LIMIT 1`;
  const agUpd = agUpdRes.rows[0];

  let linkIfct = agUpd.linkIfct;
  if (!linkIfct || !agUpd.linkIfctExpiraEm || agUpd.linkIfctExpiraEm < ts || agUpd.ifctStatus === "validado") {
    linkIfct = gerarUuid();
    const expiraEm = ts + LINK_EXPIRA_MS;
    await sql`
      UPDATE agendamentos
      SET linkIfct = ${linkIfct}, linkIfctExpiraEm = ${expiraEm}, ifctStatus = 'pendente', atualizadoEm = ${ts}
      WHERE id = ${agendamentoId}
    `;
  }

  let emailResult: { ok: boolean; messageId?: string; error?: string } | null = null;
  if (isMailerConfigured()) {
    try {
      const solRes = await sql`SELECT id, postoGraduacao, warName, name, email FROM users WHERE id = ${agUpd.solicitante} LIMIT 1`;
      const sol = solRes.rows[0];

      if (sol && sol.email) {
        const vRes = await sql`SELECT placa, prefixo FROM viaturas WHERE id = ${agUpd.viaturaAtribuida} LIMIT 1`;
        const v = vRes.rows[0];

        const appBase = (process.env.APP_BASE_URL || "http://localhost:5174").replace(/\/+$/, "");
        const linkIfctFull = `${appBase}/#/ifct/${linkIfct}`;

        const tpl = agendamentoAprovadoEmail({
          solicitantePosto: sol.postoGraduacao || "",
          solicitanteNome: sol.warName || sol.name || "Policial",
          solicitanteEmail: sol.email,
          aprovadorPosto: user.postoGraduacao || "",
          aprovadorNome: user.warName || user.name || "Gestor",
          agendamentoId: agUpd.id,
          dataMissao: formatDateBR(agUpd.dataMissao),
          horaApresentacao: agUpd.horarioApresentacao || agUpd.retiradaHora || "—",
          destino: agUpd.destino || "—",
          finalidade: agUpd.finalidade || "—",
          viaturaPlaca: v?.placa ?? null,
          viaturaPrefixo: v?.prefixo ?? null,
          motoristaPosto: agUpd.motoristaPosto ?? null,
          motoristaNome: agUpd.motoristaNome ?? null,
          motoristaRe: agUpd.motoristaRe ?? null,
          linkIfct: linkIfctFull,
          aprovadoEm: formatDateTimeBR(agUpd.aprovadoEm || ts),
        });

        emailResult = await sendEmail({
          to: sol.email,
          subject: tpl.subject,
          text: tpl.text,
          html: tpl.html,
          replyTo: user.email || undefined,
        });
      } else {
        console.log(`[atribuir] agendamento ${agendamentoId} sem email do solicitante (id=${agUpd.solicitante})`);
        emailResult = { ok: false, error: "solicitante sem email cadastrado" };
      }
    } catch (e: any) {
      console.log(`[atribuir] erro ao disparar email: ${e.message}`);
      emailResult = { ok: false, error: e.message };
    }
  } else {
    console.log(`[atribuir] SMTP nao configurado - email nao enviado`);
    emailResult = { ok: false, error: "SMTP nao configurado" };
  }

  return res.status(200).json({
    ok: true,
    linkIfct,
    emailEnviado: emailResult?.ok || false,
    emailErro: emailResult?.ok ? undefined : emailResult?.error,
  });
}
