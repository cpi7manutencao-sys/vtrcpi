// ============================================================
// app-base-url.ts
// Resolve a URL base do app no FRONTEND com fallback robusto.
//
// Ordem de prioridade:
//   1. VITE_APP_BASE_URL (env var do Vite/build) - SEMPRE vence
//   2. window.location.origin - normal
//   3. Se window.location.origin for o dominio zumbi antigo
//      (vtrcpi.vercel.app) -> redireciona pro vtrcpi-five.
//
// Por que existe: o FRONTEND tbm precisa gerar links de IFCT
// (modal "Compartilhar" e QRCode da Ronda). Antes usava
// `window.location.origin` direto. Se o usuario abriu o sistema
// pelo dominio zumbi (vtrcpi.vercel.app, que nao tem APIs),
// os links gerados saiam errados.
//
// FIX (William 2026-09-22): isola a logica em uma funcao pra
// garantir consistencia entre os 2 pontos que geram URL.
// ============================================================

const ZUMBI_DOMINIOS = [
  'vtrcpi.vercel.app',
  // adiciona aqui se tiver mais dominios zumbis no futuro
];

export function getClientAppBaseUrl(): string {
  // 1) Manual override via env var do Vite (build-time)
  const envBase = (import.meta.env.VITE_APP_BASE_URL as string | undefined)?.trim().replace(/\/+$/, '');
  if (envBase) return envBase;

  // 2) window.location.origin
  const origin = window.location.origin;

  // 3) Se for dominio zumbi, redireciona pro canônico
  for (const z of ZUMBI_DOMINIOS) {
    if (origin.includes(z)) {
      return 'https://vtrcpi-five.vercel.app';
    }
  }

  return origin;
}
