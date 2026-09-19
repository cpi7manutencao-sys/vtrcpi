// ============================================================
// api/[...path].ts - Router UNICO para Vercel Hobby Plan
// Vercel Hobby limita em 12 serverless functions. Pra respeitar
// o limite, juntamos TODOS os endpoints em 1 function que faz
// dispatch interno pelo path da requisição.
//
// Formato:
//   GET/POST /api/health -> _handlers/health.ts
//   POST /api/agendamentos/approve -> _agendamentos/approve.ts
//   GET /api/users/list -> _users/list.ts
//   etc.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";

// Mapa path -> carregador (lazy import pra evitar carregar tudo em toda request)
type HandlerModule = { default: (req: VercelRequest, res: VercelResponse) => Promise<any> | any };

const routes: Record<string, () => Promise<HandlerModule>> = {
  "/api/health": () => import("./_handlers/health"),

  "/api/auth/google/start": () => import("./_auth/google/start"),
  "/api/auth/google/callback": () => import("./_auth/google/callback"),
  "/api/auth/me": () => import("./_auth/me"),
  "/api/auth/refresh": () => import("./_auth/refresh"),

  "/api/users/approve": () => import("./_users/approve"),
  "/api/users/busca-por-re": () => import("./_users/busca-por-re"),
  "/api/users/list": () => import("./_users/list"),
  "/api/users/pending": () => import("./_users/pending"),
  "/api/users/profile": () => import("./_users/profile"),
  "/api/users/promote": () => import("./_users/promote"),
  "/api/users/reject": () => import("./_users/reject"),

  "/api/units/create": () => import("./_units/create"),
  "/api/units/get-by-code": () => import("./_units/get-by-code"),
  "/api/units/list": () => import("./_units/list"),
  "/api/units/list-hierarchical": () => import("./_units/list-hierarchical"),
  "/api/units/update": () => import("./_units/update"),
  "/api/units/upsert": () => import("./_units/upsert"),

  "/api/agendamentos/approve": () => import("./_agendamentos/approve"),
  "/api/agendamentos/atribuir": () => import("./_agendamentos/atribuir"),
  "/api/agendamentos/atualizar-motorista": () => import("./_agendamentos/atualizar-motorista"),
  "/api/agendamentos/cancel": () => import("./_agendamentos/cancel"),
  "/api/agendamentos/concluir": () => import("./_agendamentos/concluir"),
  "/api/agendamentos/create": () => import("./_agendamentos/create"),
  "/api/agendamentos/editar-odometro": () => import("./_agendamentos/editar-odometro"),
  "/api/agendamentos/excluir": () => import("./_agendamentos/excluir"),
  "/api/agendamentos/get": () => import("./_agendamentos/get"),
  "/api/agendamentos/get-ultimo-odometro": () => import("./_agendamentos/get-ultimo-odometro"),
  "/api/agendamentos/list": () => import("./_agendamentos/list"),
  "/api/agendamentos/list-pendentes": () => import("./_agendamentos/list-pendentes"),
  "/api/agendamentos/list-por-mes": () => import("./_agendamentos/list-por-mes"),
  "/api/agendamentos/reject": () => import("./_agendamentos/reject"),

  "/api/dashboard/evolucao-mensal": () => import("./_dashboard/evolucao-mensal"),
  "/api/dashboard/get-home-stats": () => import("./_dashboard/get-home-stats"),
  "/api/dashboard/get-totais": () => import("./_dashboard/get-totais"),

  "/api/ifct/abastecimento": () => import("./_ifct/abastecimento"),
  "/api/ifct/encerramento": () => import("./_ifct/encerramento"),
  "/api/ifct/finalizar": () => import("./_ifct/finalizar"),
  "/api/ifct/gerar-link": () => import("./_ifct/gerar-link"),
  "/api/ifct/get-by-token": () => import("./_ifct/get-by-token"),
  "/api/ifct/listar-abastecimentos": () => import("./_ifct/listar-abastecimentos"),
  "/api/ifct/pdf": () => import("./_ifct/pdf"),
  "/api/ifct/revogar-link": () => import("./_ifct/revogar-link"),
  "/api/ifct/salvar-motorista": () => import("./_ifct/salvar-motorista"),
  "/api/ifct/sugestao-km-partida": () => import("./_ifct/sugestao-km-partida"),
  "/api/ifct/validar": () => import("./_ifct/validar"),

  "/api/rondas/gerar-link": () => import("./_rondas/gerar-link"),
  "/api/rondas/get-by-token": () => import("./_rondas/get-by-token"),
  "/api/rondas/list-by-viatura": () => import("./_rondas/list-by-viatura"),
  "/api/rondas/salvar": () => import("./_rondas/salvar"),
  "/api/rondas/salvar-por-ifct": () => import("./_rondas/salvar-por-ifct"),

  "/api/viaturas/colocar-em-descarga": () => import("./_viaturas/colocar-em-descarga"),
  "/api/viaturas/get": () => import("./_viaturas/get"),
  "/api/viaturas/list": () => import("./_viaturas/list"),
  "/api/viaturas/list-by-descarga": () => import("./_viaturas/list-by-descarga"),
  "/api/viaturas/reativar": () => import("./_viaturas/reativar"),
  "/api/viaturas/toggle-ativo": () => import("./_viaturas/toggle-ativo"),
  "/api/viaturas/upsert": () => import("./_viaturas/upsert"),

  "/api/viatura-historico/list-by-viatura": () => import("./_viatura-historico/list-by-viatura"),
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // O path chega como /api/foo/bar
  // Pega só o pathname (sem query string)
  const url = req.url || "";
  const path = url.split("?")[0];

  const loader = routes[path];

  if (!loader) {
    res.status(404).json({ ok: false, error: `Route not found: ${path}` });
    return;
  }

  try {
    const mod = await loader();
    if (typeof mod.default !== "function") {
      res.status(500).json({ ok: false, error: `Handler for ${path} has no default export` });
      return;
    }
    return await mod.default(req, res);
  } catch (e: any) {
    console.error(`[api-router] Error in ${path}:`, e?.message || e);
    if (!res.headersSent) {
      res.status(500).json({ ok: false, error: e?.message || "Internal error" });
    }
  }
}
