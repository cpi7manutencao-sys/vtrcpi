// ============================================================
// /api/_debug/appbase
// DEBUG TEMPORARIO: retorna o appBase que o sistema ta usando.
// William pediu pra investigar por que o link do ICT sai com
// dominio errado. Esse endpoint revela o que getAppBaseUrl() resolve.
// REMOVER apos debugar.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAppBaseUrl } from "../lib/config";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const appBase = getAppBaseUrl();
  return res.status(200).json({
    ok: true,
    debug: {
      appBaseResolvido: appBase,
      appBaseEnvs: {
        APP_BASE_URL: process.env.APP_BASE_URL || "(vazio)",
        VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL || "(vazio)",
        VERCEL_URL: process.env.VERCEL_URL || "(vazio)",
        VERCEL_ENV: process.env.VERCEL_ENV || "(vazio)",
        VERCEL: process.env.VERCEL || "(vazio)",
        NODE_ENV: process.env.NODE_ENV || "(vazio)",
      },
      exemploLinkIfct: `${appBase}/#/ifct/12345678-1234-4abc-9def-123456789012`,
      exemploLinkIfctErrado: "https://vtrcpi.vercel.app/#/ifct/...",
    },
  });
}
