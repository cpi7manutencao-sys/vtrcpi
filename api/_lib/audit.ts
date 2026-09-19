// ============================================================
// audit.ts - Logger de ações sensíveis (LGPD)
// ============================================================

import { sql, now } from "./db";

export async function audit(
  userId: number | null,
  cpf: string | null,
  action: string,
  resource: string | null,
  resourceId: string | null,
  details: any,
  req: { headers: any; ip?: string }
): Promise<void> {
  try {
    await sql`
      INSERT INTO audit_log (user_id, cpf, action, resource, resource_id, details, ip_origem, user_agent, data_hora)
      VALUES (
        ${userId}, ${cpf}, ${action}, ${resource}, ${resourceId},
        ${JSON.stringify(details)},
        ${req.ip || (req.headers["x-forwarded-for"] as string) || null},
        ${(req.headers["user-agent"] as string) || null},
        ${now()}
      )
    `;
  } catch (e) {
    // Audit não pode falhar a request principal
    console.error("[audit] erro:", e);
  }
}
