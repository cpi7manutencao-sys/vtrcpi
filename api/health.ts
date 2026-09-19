// ============================================================
// GET /api/health
// Health check do backend (Vercel Postgres + JWT secret)
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "./_lib/db";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const checks: Record<string, any> = {
    api: "ok",
    jwt: process.env.JWT_SECRET ? "configured" : "missing",
    google: process.env.GOOGLE_CLIENT_ID ? "configured" : "missing",
  };

  try {
    const result = await sql`SELECT NOW() as now, COUNT(*) as users FROM users`;
    checks.postgres = "ok";
    checks.dbTime = result.rows[0]?.now;
    checks.userCount = parseInt(result.rows[0]?.users || "0");
  } catch (e: any) {
    checks.postgres = "error";
    checks.postgresError = e.message;
  }

  return res.status(200).json({
    ok: true,
    service: "viaturas-cpi7-vercel",
    timestamp: new Date().toISOString(),
    checks,
  });
}
