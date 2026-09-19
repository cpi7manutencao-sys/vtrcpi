// ============================================================
// api.ts - Wrappers pros endpoints da Vercel (Postgres backend)
// Cada função mapeia 1 endpoint HTTP
// IMPORTANTE: funcoes usadas como array (setState, .find, .filter)
// devem RETORNAR ARRAY DIRETO, nao objeto {ok, items}.
// ============================================================

import { apiFetch } from "./auth";

// ============================================================
// AUTH
// ============================================================

export const refreshSession = () => apiFetch(`/api/auth/refresh`, { method: "POST" });

// ============================================================
// UNITS
// ============================================================

/**
 * Lista unidades. Retorna ARRAY de unidades (cada uma com id, code, name, sigla, etc).
 * O endpoint /api/units/list retorna {ok, units: [...]}; extraimos .units aqui.
 */
export const listUnits = async (activeOnly = true): Promise<any[]> => {
  const data: any = await apiFetch(`/api/units/list?activeOnly=${activeOnly}`);
  return data.units || [];
};

export const getUnit = async (id: number) => {
  const units = await listUnits(false);
  return units.find((u: any) => u.id === id);
};

export const listUnitsHierarchical = async () => {
  // Por enquanto, retorna flat; hierarquia eh resolvida client-side via parentUnit/commandUnit
  return listUnits();
};

// TODO Sprint 2: implementar endpoints
export const createUnit = async (_args: any) => ({ ok: true, id: 0 });
export const updateUnit = async (_args: any) => ({ ok: true });
export const deactivateUnit = async (_cpf: string, _id: string) => ({ ok: true });
export const reactivateUnit = async (_cpf: string, _id: string) => ({ ok: true });

// ============================================================
// USERS
// ============================================================

export const listAllUsers = async (onlyApproved = true, search = ""): Promise<any[]> => {
  const data: any = await apiFetch(
    `/api/users/list?onlyApproved=${onlyApproved}${search ? `&search=${encodeURIComponent(search)}` : ""}`
  );
  return data.users || [];
};

export const listPendingUsers = async (): Promise<any[]> => {
  const data: any = await apiFetch(`/api/users/pending`);
  return data.users || [];
};

// FIX (William 2026-09-14 v65): approveUser usa mesma hierarquia nova
export const approveUser = (userId: number, viaturasRole: string, matrizId?: number, filhasIds?: number[] | null) =>
  apiFetch(`/api/users/approve`, {
    method: "POST",
    body: JSON.stringify({ userId, viaturasRole, matrizId, filhasIds }),
  });

export const rejectUser = (userId: number, motivo: string) =>
  apiFetch(`/api/users/reject`, {
    method: "POST",
    body: JSON.stringify({ userId, motivo }),
  });

export const promoteUser = (userId: number, opts: { viaturasRole?: string; unidadesGestor?: number[]; unidadesEditor?: number[]; escopo?: string; unitId?: number }) =>
  apiFetch(`/api/users/promote`, {
    method: "POST",
    body: JSON.stringify({ userId, ...opts }),
  });

// FIX (William 2026-09-14 v65): aceita matrizId + filhasIds (nova hierarquia)
export const setViaturasRole = (args: {
  userId: number;
  viaturasRole: string;
  escopo?: string;
  matrizId?: number;
  filhasIds?: number[] | null;
  // Modo legado (continua aceitando, mas recomendado usar matriz+filhas):
  unidadesGestor?: number[];
  unidadesEditor?: number[];
  unitId?: number | null;
}) =>
  apiFetch(`/api/users/promote`, {
    method: "POST",
    body: JSON.stringify(args),
  });

export const completeProfile = (data: any) =>
  apiFetch(`/api/users/profile`, {
    method: "POST",
    body: JSON.stringify(data),
  });

// ============================================================
// AGENDAMENTOS
// ============================================================

/**
 * Lista agendamentos. Retorna ARRAY direto.
 * Parametros: status (opcional), unidadeId (opcional)
 */
export const listAgendamentos = async (_cpf?: string, status?: string, unidadeId?: string): Promise<any[]> => {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (unidadeId) params.set("unidadeId", unidadeId);
  const qs = params.toString();
  const data: any = await apiFetch(`/api/agendamentos/list${qs ? `?${qs}` : ""}`);
  return data.agendamentos || [];
};

export const listAgendamentosPendentes = async (_cpf?: string): Promise<any[]> => listAgendamentos(undefined, "pendente");

export const getAgendamento = async (id: number) => {
  const data: any = await apiFetch(`/api/agendamentos/get?id=${id}`);
  return data;
};

export const listAgendamentosPorMes = async (_cpf: string, ano: number, mes: number): Promise<any[]> => {
  const data: any = await apiFetch(`/api/agendamentos/list-por-mes?ano=${ano}&mes=${mes}`);
  return data.agendamentos || [];
};

/**
 * Cria novo agendamento.
 * Args: camelCase igual Convex (unidadeRequerente, dataMissao, etc).
 * Nao precisa de cpf - backend pega do JWT.
 */
export const createAgendamento = async (args: any) => {
  return apiFetch(`/api/agendamentos/create`, {
    method: "POST",
    body: JSON.stringify(args),
  });
};

// SAT agora é client-side (parser no browser). Ver lib/sat-parser.ts
// A Vercel não consegue acessar a intranet PM, então o user abre o SAT
// direto no navegador dele e cola o resultado aqui.

export const approveAgendamento = async (_cpf: string, agendamentoId: number) => {
  return apiFetch(`/api/agendamentos/approve`, {
    method: "POST",
    body: JSON.stringify({ agendamentoId }),
  });
};

export const rejectAgendamento = async (_cpf: string, agendamentoId: number, motivo: string) => {
  return apiFetch(`/api/agendamentos/reject`, {
    method: "POST",
    body: JSON.stringify({ agendamentoId, motivo }),
  });
};

export const atribuirViatura = async (_cpf: string, agendamentoId: number, viaturaId: number, odometroRetirada?: number) => {
  return apiFetch(`/api/agendamentos/atribuir`, {
    method: "POST",
    body: JSON.stringify({ agendamentoId, viaturaId, odometroRetirada }),
  });
};

export const getUltimoOdometro = async (viaturaId: number) => {
  return apiFetch(`/api/agendamentos/get-ultimo-odometro?viaturaId=${viaturaId}`);
};

export const concluirAgendamento = async (_cpf: string, agendamentoId: number, odometroDevolucao?: number, naoCompareceu?: boolean) => {
  return apiFetch(`/api/agendamentos/concluir`, {
    method: "POST",
    body: JSON.stringify({ agendamentoId, odometroDevolucao, naoCompareceu }),
  });
};

export const editarOdometro = async (_cpf: string, agendamentoId: number, tipo: string, novoOdometro: number) => {
  return apiFetch(`/api/agendamentos/editar-odometro`, {
    method: "POST",
    body: JSON.stringify({ agendamentoId, tipo, novoOdometro }),
  });
};

export const cancelAgendamento = async (_cpf: string, agendamentoId: number) => {
  return apiFetch(`/api/agendamentos/cancel`, {
    method: "POST",
    body: JSON.stringify({ agendamentoId }),
  });
};

export const excluirAgendamento = async (_cpf: string, agendamentoId: number) => {
  return apiFetch(`/api/agendamentos/excluir`, {
    method: "POST",
    body: JSON.stringify({ agendamentoId }),
  });
};

/**
 * FIX (William 2026-09-04): atualiza dados do motorista de um agendamento.
 * Chamado pelo GESTOR quando o solicitante NAO eh o motorista - o gestor
 * consulta o SAT do RE informado e preenche os dados do motorista aqui.
 */
export const atualizarMotorista = async (agendamentoId: number, data: {
  motoristaRe: string;
  motoristaPosto: string;
  motoristaNome: string;
  motoristaOpm?: string;
  motoristaOpmCode?: string;
  motoristaCnh?: string;
  motoristaBoletim?: string;
  motoristaDataProva?: string;
  motoristaPublicacoes?: any[];
}) => {
  return apiFetch(`/api/agendamentos/atualizar-motorista`, {
    method: "POST",
    body: JSON.stringify({ agendamentoId, ...data }),
  });
};

// ============================================================
// DASHBOARD
// ============================================================

export const getTotais = async (_cpf: string) => {
  return apiFetch(`/api/dashboard/get-totais`);
};

export const getHomeStats = async (_cpf: string) => {
  return apiFetch(`/api/dashboard/get-home-stats`);
};

export const getEvolucaoMensal = async (_cpf: string, opm?: string, subordinada?: string) => {
  const params = new URLSearchParams();
  if (opm) params.set("opm", opm);
  if (subordinada) params.set("subordinada", subordinada);
  const qs = params.toString();
  return apiFetch(`/api/dashboard/evolucao-mensal${qs ? `?${qs}` : ""}`);
};

// ============================================================
// VIATURAS
// ============================================================

/**
 * Lista viaturas. Retorna ARRAY direto.
 * Parametros: opm (code), ativo (bool), tipo (CR/MT), unidadeId
 */
export const listViaturas = async (
  _cpf?: string,
  opm?: string,
  ativo?: boolean,
  tipo?: string,
  unidadeId?: number
): Promise<any[]> => {
  const params = new URLSearchParams();
  if (opm) params.set("opm", opm);
  if (ativo !== undefined) params.set("ativo", String(ativo));
  if (tipo) params.set("tipo", tipo);
  if (unidadeId) params.set("unidadeId", String(unidadeId));
  const qs = params.toString();
  const data: any = await apiFetch(`/api/viaturas/list${qs ? `?${qs}` : ""}`);
  return data.viaturas || [];
};

export const getViatura = async (id: number) => {
  return apiFetch(`/api/viaturas/get?id=${id}`);
};
export const upsertViatura = async (args: any) => {
  return apiFetch(`/api/viaturas/upsert`, {
    method: "POST",
    body: JSON.stringify(args),
  });
};
export const removeViatura = async (_cpf: string, _id: string) => ({ ok: true });
export const colocarViaturaEmDescarga = async (cpf: string, id: string, motivo?: string) => {
  return apiFetch(`/api/viaturas/colocar-em-descarga`, {
    method: "POST",
    body: JSON.stringify({ viaturaId: id, motivo }),
  });
};
export const listViaturasByDescarga = async (_cpf: string) => {
  const data: any = await apiFetch(`/api/viaturas/list-by-descarga`);
  return data.viaturas || [];
};
export const reativarViatura = async (cpf: string, id: string) => {
  return apiFetch(`/api/viaturas/reativar`, {
    method: "POST",
    body: JSON.stringify({ viaturaId: id }),
  });
};
export const toggleViaturaAtivo = async (
  _cpf: string,
  viaturaId: string,
  novoAtivo: boolean,
  motivo?: string,
  situacao?: string,
  observacao?: string
) => {
  return apiFetch(`/api/viaturas/toggle-ativo`, {
    method: "POST",
    body: JSON.stringify({ viaturaId, ativo: novoAtivo, motivo, situacao, observacao }),
  });
};

// VIATURA_HISTORICO
export const listViaturaHistorico = async (_cpf: string, viaturaId: string) => {
  const data: any = await apiFetch(`/api/viatura-historico/list-by-viatura?viaturaId=${viaturaId}`);
  return data.historico || [];
};

// ============================================================
// IFCT
// ============================================================

export const gerarLinkIfct = async (_cpf: string, agendamentoId: string) => {
  return apiFetch(`/api/ifct/gerar-link`, {
    method: "POST",
    body: JSON.stringify({ agendamentoId }),
  });
};
// FIX (William 2026-09-14 v58): aceita objeto {aprovar, justificativa}
// - Modo legado (string): valida direto (compatibilidade)
// - Modo novo (objeto): {aprovar: bool, justificativa?: string}
export const validarIfct = async (
  _cpf: string,
  agendamentoId: string | number,
  opts?: string | { aprovar?: boolean; justificativa?: string; observacao?: string }
) => {
  let body: any = { agendamentoId };
  if (typeof opts === "string") {
    body.observacao = opts;
  } else if (opts && typeof opts === "object") {
    Object.assign(body, opts);
  }
  return apiFetch(`/api/ifct/validar`, {
    method: "POST",
    body: JSON.stringify(body),
  });
};
export const revogarLinkIfct = async (_cpf: string, agendamentoId: string) => {
  return apiFetch(`/api/ifct/revogar-link`, {
    method: "POST",
    body: JSON.stringify({ agendamentoId }),
  });
};
export const getByIfctToken = async (token: string) => {
  return apiFetch(`/api/ifct/get-by-token?token=${encodeURIComponent(token)}`);
};
export const salvarIfctMotorista = async (args: any) => {
  return apiFetch(`/api/ifct/salvar-motorista`, {
    method: "POST",
    body: JSON.stringify(args),
  });
};
export const uploadComprovanteIfct = async (_token: string, _tipoAbastecimento: string) => ({ ok: true, uploadUrl: null });

// ============================================================
// RONDAS
// ============================================================

export const gerarLinkRonda = async (_cpf: string, viaturaId: string) => {
  return apiFetch(`/api/rondas/gerar-link`, {
    method: "POST",
    body: JSON.stringify({ viaturaId }),
  });
};
export const listRondasByViatura = async (_cpf: string, viaturaId: string) => {
  const data: any = await apiFetch(`/api/rondas/list-by-viatura?viaturaId=${viaturaId}`);
  return data.rondas || [];
};
export const getByRondaToken = async (token: string) => {
  return apiFetch(`/api/rondas/get-by-token?token=${encodeURIComponent(token)}`);
};
export const salvarRonda = async (args: any) => {
  return apiFetch(`/api/rondas/salvar`, {
    method: "POST",
    body: JSON.stringify(args),
  });
};

// ============================================================
// SESSION MANAGEMENT
// ============================================================

export function me() {
  return apiFetch(`/api/auth/me`);
}
