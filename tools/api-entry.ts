// ============================================================
// tools/api-entry.ts - Router UNICO para Vercel Hobby Plan
// Bundle por tools/build-api.mjs (esbuild) em .vercel/output/
// Movido pra tools/ pra Vercel NAO detectar como entry point tradicional
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";

// Imports ESTATICOS (esbuild inline tudo)
import * as health from "../internal/handlers/health";
import * as authStart from "../internal/auth/google/start";
import * as authCallback from "../internal/auth/google/callback";
import * as authMe from "../internal/auth/me";
import * as authRefresh from "../internal/auth/refresh";

import * as usersApprove from "../internal/users/approve";
import * as usersBuscaPorRe from "../internal/users/busca-por-re";
import * as usersList from "../internal/users/list";
import * as usersPending from "../internal/users/pending";
import * as usersProfile from "../internal/users/profile";
import * as usersPromote from "../internal/users/promote";
import * as usersReject from "../internal/users/reject";

import * as unitsCreate from "../internal/units/create";
import * as unitsGetByCode from "../internal/units/get-by-code";
import * as unitsList from "../internal/units/list";
import * as unitsListHierarchical from "../internal/units/list-hierarchical";
import * as unitsUpdate from "../internal/units/update";
import * as unitsUpsert from "../internal/units/upsert";

import * as agApprove from "../internal/agendamentos/approve";
import * as agAtribuir from "../internal/agendamentos/atribuir";
import * as agAtualizarMotorista from "../internal/agendamentos/atualizar-motorista";
import * as agCancel from "../internal/agendamentos/cancel";
import * as agConcluir from "../internal/agendamentos/concluir";
import * as agCreate from "../internal/agendamentos/create";
import * as agEditarOdometro from "../internal/agendamentos/editar-odometro";
import * as agExcluir from "../internal/agendamentos/excluir";
import * as agGet from "../internal/agendamentos/get";
import * as agGetUltimoOdometro from "../internal/agendamentos/get-ultimo-odometro";
import * as agList from "../internal/agendamentos/list";
import * as agListPendentes from "../internal/agendamentos/list-pendentes";
import * as agListPorMes from "../internal/agendamentos/list-por-mes";
import * as agReject from "../internal/agendamentos/reject";

import * as dashEvolucaoMensal from "../internal/dashboard/evolucao-mensal";
import * as dashGetHomeStats from "../internal/dashboard/get-home-stats";
import * as dashGetTotais from "../internal/dashboard/get-totais";

import * as ifctAbastecimento from "../internal/ifct/abastecimento";
import * as ifctEncerramento from "../internal/ifct/encerramento";
import * as ifctFinalizar from "../internal/ifct/finalizar";
import * as ifctGerarLink from "../internal/ifct/gerar-link";
import * as ifctGetByToken from "../internal/ifct/get-by-token";
import * as ifctListarAbastecimentos from "../internal/ifct/listar-abastecimentos";
import * as ifctPdf from "../internal/ifct/pdf";
import * as ifctRevogarLink from "../internal/ifct/revogar-link";
import * as ifctSalvarMotorista from "../internal/ifct/salvar-motorista";
import * as ifctSugestaoKmPartida from "../internal/ifct/sugestao-km-partida";
import * as ifctValidar from "../internal/ifct/validar";

import * as rondasGerarLink from "../internal/rondas/gerar-link";
import * as rondasGetByToken from "../internal/rondas/get-by-token";
import * as rondasListByViatura from "../internal/rondas/list-by-viatura";
import * as rondasSalvar from "../internal/rondas/salvar";
import * as rondasSalvarPorIfct from "../internal/rondas/salvar-por-ifct";

import * as vtrColocarDescarga from "../internal/viaturas/colocar-em-descarga";
import * as vtrGet from "../internal/viaturas/get";
import * as vtrList from "../internal/viaturas/list";
import * as vtrListByDescarga from "../internal/viaturas/list-by-descarga";
import * as vtrReativar from "../internal/viaturas/reativar";
import * as vtrToggleAtivo from "../internal/viaturas/toggle-ativo";
import * as vtrUpsert from "../internal/viaturas/upsert";

import * as vtrHistList from "../internal/viatura-historico/list-by-viatura";

type Handler = (req: VercelRequest, res: VercelResponse) => Promise<any> | any;
type HandlerModule = { default: Handler };

const routes: Record<string, HandlerModule> = {
  "/api/health": health as HandlerModule,
  "/api/auth/google/start": authStart as HandlerModule,
  "/api/auth/google/callback": authCallback as HandlerModule,
  "/api/auth/me": authMe as HandlerModule,
  "/api/auth/refresh": authRefresh as HandlerModule,

  "/api/users/approve": usersApprove as HandlerModule,
  "/api/users/busca-por-re": usersBuscaPorRe as HandlerModule,
  "/api/users/list": usersList as HandlerModule,
  "/api/users/pending": usersPending as HandlerModule,
  "/api/users/profile": usersProfile as HandlerModule,
  "/api/users/promote": usersPromote as HandlerModule,
  "/api/users/reject": usersReject as HandlerModule,

  "/api/units/create": unitsCreate as HandlerModule,
  "/api/units/get-by-code": unitsGetByCode as HandlerModule,
  "/api/units/list": unitsList as HandlerModule,
  "/api/units/list-hierarchical": unitsListHierarchical as HandlerModule,
  "/api/units/update": unitsUpdate as HandlerModule,
  "/api/units/upsert": unitsUpsert as HandlerModule,

  "/api/agendamentos/approve": agApprove as HandlerModule,
  "/api/agendamentos/atribuir": agAtribuir as HandlerModule,
  "/api/agendamentos/atualizar-motorista": agAtualizarMotorista as HandlerModule,
  "/api/agendamentos/cancel": agCancel as HandlerModule,
  "/api/agendamentos/concluir": agConcluir as HandlerModule,
  "/api/agendamentos/create": agCreate as HandlerModule,
  "/api/agendamentos/editar-odometro": agEditarOdometro as HandlerModule,
  "/api/agendamentos/excluir": agExcluir as HandlerModule,
  "/api/agendamentos/get": agGet as HandlerModule,
  "/api/agendamentos/get-ultimo-odometro": agGetUltimoOdometro as HandlerModule,
  "/api/agendamentos/list": agList as HandlerModule,
  "/api/agendamentos/list-pendentes": agListPendentes as HandlerModule,
  "/api/agendamentos/list-por-mes": agListPorMes as HandlerModule,
  "/api/agendamentos/reject": agReject as HandlerModule,

  "/api/dashboard/evolucao-mensal": dashEvolucaoMensal as HandlerModule,
  "/api/dashboard/get-home-stats": dashGetHomeStats as HandlerModule,
  "/api/dashboard/get-totais": dashGetTotais as HandlerModule,

  "/api/ifct/abastecimento": ifctAbastecimento as HandlerModule,
  "/api/ifct/encerramento": ifctEncerramento as HandlerModule,
  "/api/ifct/finalizar": ifctFinalizar as HandlerModule,
  "/api/ifct/gerar-link": ifctGerarLink as HandlerModule,
  "/api/ifct/get-by-token": ifctGetByToken as HandlerModule,
  "/api/ifct/listar-abastecimentos": ifctListarAbastecimentos as HandlerModule,
  "/api/ifct/pdf": ifctPdf as HandlerModule,
  "/api/ifct/revogar-link": ifctRevogarLink as HandlerModule,
  "/api/ifct/salvar-motorista": ifctSalvarMotorista as HandlerModule,
  "/api/ifct/sugestao-km-partida": ifctSugestaoKmPartida as HandlerModule,
  "/api/ifct/validar": ifctValidar as HandlerModule,

  "/api/rondas/gerar-link": rondasGerarLink as HandlerModule,
  "/api/rondas/get-by-token": rondasGetByToken as HandlerModule,
  "/api/rondas/list-by-viatura": rondasListByViatura as HandlerModule,
  "/api/rondas/salvar": rondasSalvar as HandlerModule,
  "/api/rondas/salvar-por-ifct": rondasSalvarPorIfct as HandlerModule,

  "/api/viaturas/colocar-em-descarga": vtrColocarDescarga as HandlerModule,
  "/api/viaturas/get": vtrGet as HandlerModule,
  "/api/viaturas/list": vtrList as HandlerModule,
  "/api/viaturas/list-by-descarga": vtrListByDescarga as HandlerModule,
  "/api/viaturas/reativar": vtrReativar as HandlerModule,
  "/api/viaturas/toggle-ativo": vtrToggleAtivo as HandlerModule,
  "/api/viaturas/upsert": vtrUpsert as HandlerModule,

  "/api/viatura-historico/list-by-viatura": vtrHistList as HandlerModule,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const url = req.url || "";
  const path = url.split("?")[0];

  const mod = routes[path];

  if (!mod) {
    res.status(404).json({ ok: false, error: `Route not found: ${path}` });
    return;
  }

  if (typeof mod.default !== "function") {
    res.status(500).json({ ok: false, error: `Handler for ${path} has no default export` });
    return;
  }

  return await mod.default(req, res);
}
