// ============================================================
// audit.ts - Logger de ações sensíveis (LGPD)
// ============================================================

import { sql, now } from "./db";

export async function audit(
  userId: number | null,
  cpf: string | null | undefined,
  action: string,
  resource: string | null,
  resourceId: string | null,
  details: any,
  req: { headers: any; ip?: string }
): Promise<void> {
  try {
    await sql`
      INSERT INTO auditLog (userId, cpf, action, resource, resourceId, details, ipOrigem, userAgent, dataHora)
      VALUES (
        ${userId}, ${cpf ?? null}, ${action}, ${resource}, ${resourceId},
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
