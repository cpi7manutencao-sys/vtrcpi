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
