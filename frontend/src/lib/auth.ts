// ============================================================
// auth.ts - Auth Google (OAuth 2.0 popup) + JWT próprio + apiFetch
// Sistema de Viaturas CPI-7 (Vercel)
// ============================================================

import { useEffect, useState } from "react";

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) || "";
const GOOGLE_CLIENT_ID =
  (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) || "";

const TOKEN_KEY = "viaturas_token";
const USER_KEY = "viaturas_user";

export interface User {
  id: number;
  googleId: string;
  email: string;
  name: string;
  picture?: string;
  cpf?: string;
  re?: string;
  digre?: string;
  warName?: string;
  postoGraduacao?: string;
  opmCode?: string;
  unitId?: number;
  unit?: {
    id: number;
    code: string;
    name: string;
    sigla?: string;
  } | null;
  sexo?: string;
  dataNascimento?: string;
  telefone?: string;
  role: string;
  viaturasRole: "viewer" | "editor" | "gestor" | "admin";
  unidadesGestor: number[];
  unidadesEditor: number[];
  approved: boolean;
  active: boolean;
  escopo: "livre" | "restrito";
  isMaster: boolean;
  lastLogin?: number;
  loginCount?: number;
  createdAt?: number;
  promotedAt?: number;
}

// ============================================================
// Storage
// ============================================================

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUser(): User | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setAuth(token: string, user: User) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  window.dispatchEvent(new CustomEvent("viaturas:user-updated", { detail: user }));
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  window.dispatchEvent(new CustomEvent("viaturas:user-updated", { detail: null }));
}

export function isLoggedIn(): boolean {
  return !!getToken();
}

// ============================================================
// Permissions
// ============================================================

export function isAdmin(): boolean {
  return getUser()?.viaturasRole === "admin";
}

export function isMaster(): boolean {
  return getUser()?.isMaster === true;
}

export function isGestor(): boolean {
  const r = getUser()?.viaturasRole;
  return r === "gestor" || r === "admin";
}

export function isEditor(): boolean {
  const r = getUser()?.viaturasRole;
  return r === "editor" || r === "gestor" || r === "admin";
}

export function isEditorOrGestor(): boolean {
  return isEditor();
}

// ============================================================
// Hook de subscription
// ============================================================

export function useUserSubscription(onUpdate?: (u: User | null) => void): User | null {
  const [user, setUser] = useState<User | null>(() => getUser());
  useEffect(() => {
    function handler(e: Event) {
      const ce = e as CustomEvent<User | null>;
      setUser(ce.detail);
      onUpdate?.(ce.detail ?? null);
    }
    window.addEventListener("viaturas:user-updated", handler as EventListener);
    return () => window.removeEventListener("viaturas:user-updated", handler as EventListener);
  }, [onUpdate]);
  return user;
}

// ============================================================
// Google OAuth 2.0 - fluxo "code" (server troca por tokens)
// Mais robusto que GSI. Backend recebe o `code`, troca por
// id_token + access_token, valida o id_token, cria user.
// ============================================================

// Gera um random state pra proteger contra CSRF
function genState(): string {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

const STATE_KEY = "viaturas_oauth_state";

export interface LoginResult {
  ok: boolean;
  isNewUser: boolean;
  needsProfile: boolean;
  needsApproval: boolean;
  token: string;
  session: any;
}

/**
 * Abre popup OAuth 2.0 com Google.
 * Redireciona pra /api/auth/google/start que faz o redirect pro Google.
 * Google volta pro /api/auth/google/callback com o code.
 * Backend troca o code por tokens, valida, cria user, retorna JWT.
 */
export function loginWithGoogle(): Promise<LoginResult> {
  return new Promise(async (resolve, reject) => {
    if (!GOOGLE_CLIENT_ID) {
      reject(new Error("VITE_GOOGLE_CLIENT_ID não configurado"));
      return;
    }
    const state = genState();
    sessionStorage.setItem(STATE_KEY, state);

    // URL do backend que faz o redirect pro Google
    const origin = window.location.origin;
    const redirectUri = `${origin}/api/auth/google/callback`;
    const scope = "openid email profile";

    // Vamos abrir o fluxo numa janela popup (mais simples que redirect).
    // Backend em /api/auth/google/start faz o redirect pra Google.
    const startUrl =
      `${API_BASE}/api/auth/google/start` +
      `?redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&state=${state}`;

    // Popup
    const w = 500;
    const h = 600;
    const left = window.screen.width / 2 - w / 2;
    const top = window.screen.height / 2 - h / 2;
    const popup = window.open(
      startUrl,
      "google_oauth",
      `width=${w},height=${h},left=${left},top=${top},toolbar=no,menubar=no`
    );
    if (!popup) {
      reject(new Error("Popup bloqueado. Permita popups para este site."));
      return;
    }

    // Escuta mensagens do popup (postMessage)
    function onMessage(e: MessageEvent) {
      if (e.origin !== origin) return;
      if (e.data?.type !== "google_oauth_result") return;
      window.removeEventListener("message", onMessage);
      clearInterval(pollClosed);
      if (e.data.error) {
        reject(new Error(e.data.error));
        return;
      }
      const { token, session, isNewUser, needsProfile, needsApproval } = e.data;
      const user: User = {
        id: session.userId,
        googleId: session.googleId,
        email: session.email,
        name: session.name,
        picture: session.picture,
        cpf: session.cpf,
        re: session.re,
        warName: session.warName,
        postoGraduacao: session.postoGraduacao,
        opmCode: session.unitCode,
        unitId: session.unitId,
        role: session.role,
        viaturasRole: session.viaturasRole,
        unidadesGestor: session.unidadesGestor || [],
        unidadesEditor: session.unidadesEditor || [],
        approved: session.approved,
        active: true,
        escopo: session.escopo || "restrito",
        isMaster: session.isMaster,
      };
      setAuth(token, user);
      resolve({
        ok: true,
        isNewUser,
        needsProfile,
        needsApproval,
        token,
        session,
      });
    }
    window.addEventListener("message", onMessage);

    // Detecta popup fechado manualmente
    const pollClosed = setInterval(() => {
      if (popup.closed) {
        clearInterval(pollClosed);
        window.removeEventListener("message", onMessage);
        // Não rejeita - o user pode ter fechado sem querer, sem erro
      }
    }, 500);
  });
}

export async function logout() {
  clearAuth();
  window.location.hash = "#/login";
}

export async function refreshUserFromServer(): Promise<User | null> {
  const current = getUser();
  const token = getToken();
  if (!token) return null;
  try {
    const data: any = await apiFetch(`/api/auth/me`);
    if (!data.ok) return current;
    setAuth(token, data.user);
    return data.user as User;
  } catch (e) {
    return current;
  }
}

// ============================================================
// apiFetch
// ============================================================

export async function apiFetch<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const isAbsolute = path.startsWith("http");
  let url: string;
  if (isAbsolute) {
    url = path;
  } else if (API_BASE) {
    url = `${API_BASE}${path}`;
  } else {
    url = path;
  }

  const res = await fetch(url, { ...options, headers });

  if (res.status === 401) {
    clearAuth();
    window.location.hash = "#/login";
    throw new Error("Sessão expirada");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Erro" }));
    throw new Error(err.error || err.erro || "Erro de requisicao");
  }
  return res.json();
}

export { GOOGLE_CLIENT_ID };
