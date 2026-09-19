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
  "/api/health": () => import("../internal/handlers/health"),

  "/api/auth/google/start": () => import("../internal/auth/google/start"),
  "/api/auth/google/callback": () => import("../internal/auth/google/callback"),
  "/api/auth/me": () => import("../internal/auth/me"),
  "/api/auth/refresh": () => import("../internal/auth/refresh"),

  "/api/users/approve": () => import("../internal/users/approve"),
  "/api/users/busca-por-re": () => import("../internal/users/busca-por-re"),
  "/api/users/list": () => import("../internal/users/list"),
  "/api/users/pending": () => import("../internal/users/pending"),
  "/api/users/profile": () => import("../internal/users/profile"),
  "/api/users/promote": () => import("../internal/users/promote"),
  "/api/users/reject": () => import("../internal/users/reject"),

  "/api/units/create": () => import("../internal/units/create"),
  "/api/units/get-by-code": () => import("../internal/units/get-by-code"),
  "/api/units/list": () => import("../internal/units/list"),
  "/api/units/list-hierarchical": () => import("../internal/units/list-hierarchical"),
  "/api/units/update": () => import("../internal/units/update"),
  "/api/units/upsert": () => import("../internal/units/upsert"),

  "/api/agendamentos/approve": () => import("../internal/agendamentos/approve"),
  "/api/agendamentos/atribuir": () => import("../internal/agendamentos/atribuir"),
  "/api/agendamentos/atualizar-motorista": () => import("../internal/agendamentos/atualizar-motorista"),
  "/api/agendamentos/cancel": () => import("../internal/agendamentos/cancel"),
  "/api/agendamentos/concluir": () => import("../internal/agendamentos/concluir"),
  "/api/agendamentos/create": () => import("../internal/agendamentos/create"),
  "/api/agendamentos/editar-odometro": () => import("../internal/agendamentos/editar-odometro"),
  "/api/agendamentos/excluir": () => import("../internal/agendamentos/excluir"),
  "/api/agendamentos/get": () => import("../internal/agendamentos/get"),
  "/api/agendamentos/get-ultimo-odometro": () => import("../internal/agendamentos/get-ultimo-odometro"),
  "/api/agendamentos/list": () => import("../internal/agendamentos/list"),
  "/api/agendamentos/list-pendentes": () => import("../internal/agendamentos/list-pendentes"),
  "/api/agendamentos/list-por-mes": () => import("../internal/agendamentos/list-por-mes"),
  "/api/agendamentos/reject": () => import("../internal/agendamentos/reject"),

  "/api/dashboard/evolucao-mensal": () => import("../internal/dashboard/evolucao-mensal"),
  "/api/dashboard/get-home-stats": () => import("../internal/dashboard/get-home-stats"),
  "/api/dashboard/get-totais": () => import("../internal/dashboard/get-totais"),

  "/api/ifct/abastecimento": () => import("../internal/ifct/abastecimento"),
  "/api/ifct/encerramento": () => import("../internal/ifct/encerramento"),
  "/api/ifct/finalizar": () => import("../internal/ifct/finalizar"),
  "/api/ifct/gerar-link": () => import("../internal/ifct/gerar-link"),
  "/api/ifct/get-by-token": () => import("../internal/ifct/get-by-token"),
  "/api/ifct/listar-abastecimentos": () => import("../internal/ifct/listar-abastecimentos"),
  "/api/ifct/pdf": () => import("../internal/ifct/pdf"),
  "/api/ifct/revogar-link": () => import("../internal/ifct/revogar-link"),
  "/api/ifct/salvar-motorista": () => import("../internal/ifct/salvar-motorista"),
  "/api/ifct/sugestao-km-partida": () => import("../internal/ifct/sugestao-km-partida"),
  "/api/ifct/validar": () => import("../internal/ifct/validar"),

  "/api/rondas/gerar-link": () => import("../internal/rondas/gerar-link"),
  "/api/rondas/get-by-token": () => import("../internal/rondas/get-by-token"),
  "/api/rondas/list-by-viatura": () => import("../internal/rondas/list-by-viatura"),
  "/api/rondas/salvar": () => import("../internal/rondas/salvar"),
  "/api/rondas/salvar-por-ifct": () => import("../internal/rondas/salvar-por-ifct"),

  "/api/viaturas/colocar-em-descarga": () => import("../internal/viaturas/colocar-em-descarga"),
  "/api/viaturas/get": () => import("../internal/viaturas/get"),
  "/api/viaturas/list": () => import("../internal/viaturas/list"),
  "/api/viaturas/list-by-descarga": () => import("../internal/viaturas/list-by-descarga"),
  "/api/viaturas/reativar": () => import("../internal/viaturas/reativar"),
  "/api/viaturas/toggle-ativo": () => import("../internal/viaturas/toggle-ativo"),
  "/api/viaturas/upsert": () => import("../internal/viaturas/upsert"),

  "/api/viatura-historico/list-by-viatura": () => import("../internal/viatura-historico/list-by-viatura"),
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
