// ============================================================
// config.ts - Constantes e regras do sistema
// ============================================================

/**
 * CPF do administrador master do sistema.
 * Quando qualquer user logar (Google) ou completar perfil com
 * este CPF, eh promovido automaticamente a admin master:
 *   - role = "admin"
 *   - viaturasRole = "admin"
 *   - isMaster = TRUE
 *   - approved = TRUE
 *   - escopo = "total"
 *
 * MUDAR ESTE VALOR para revogar o acesso master de um CPF.
 */
export const MASTER_CPFS: string[] = [
  "26034202833", // Cabo William Michel Moraes - TI CPI-7
];

export function isMasterCpf(cpf: string | null | undefined): boolean {
  if (!cpf) return false;
  const cleaned = String(cpf).replace(/\D/g, "");
  return MASTER_CPFS.includes(cleaned);
}

/**
 * FIX (William 2026-09-22): resolve URL base do app com fallback inteligente.
 *
 * Ordem de prioridade:
 *   1. APP_BASE_URL (env var) - SEMPRE vence se setada (sobrescreve tudo)
 *   2. VERCEL_PROJECT_PRODUCTION_URL (Vercel Production alias oficial)
 *   3. VERCEL_URL (Vercel auto: URL do deployment atual)
 *   4. http://localhost:5174 (dev local)
 *
 * Por que existe: antes tava hardcoded `localhost:5174` em varios lugares
 * (atribuir.ts, validar.ts). Quando William setou APP_BASE_URL manualmente
 * com o dominio antigo (vtrcpi.vercel.app), o sistema gerou links quebrados.
 * Agora: se APP_BASE_URL nao tiver setada OU for vazia, detecta Vercel e usa
 * a URL correta automaticamente.
 *
 * IMPORTANTE: o fallback NAO substitui APP_BASE_URL se ela tiver setada -
 * isso preserva o controle manual (ex: ambiente de staging com URL custom).
 */
export function getAppBaseUrl(): string {
  // 1) Manual override
  const manual = (process.env.APP_BASE_URL || "").trim().replace(/\/+$/, "");
  if (manual) return manual;

  // 2) Vercel Production alias (ex: vtrcpi-five.vercel.app)
  const prod = (process.env.VERCEL_PROJECT_PRODUCTION_URL || "").trim().replace(/\/+$/, "");
  if (prod) return `https://${prod}`;

  // 3) Vercel auto (URL do deployment atual)
  const vercel = (process.env.VERCEL_URL || "").trim().replace(/\/+$/, "");
  if (vercel) return `https://${vercel}`;

  // 4) Dev local fallback
  return "http://localhost:5174";
}
