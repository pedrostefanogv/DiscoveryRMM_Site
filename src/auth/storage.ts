import type { AuthSessionState } from "./types";

const STORAGE_KEY = "discovery.auth.session.v1";

export const emptyAuthSession: AuthSessionState = {
  stage: "anonymous",
  accessToken: null,
  refreshToken: null,
  temporaryMfaToken: null,
  expiresAt: null,
  loginResponse: null,
};

/**
 * Retorna o storage utilizado para sessão de autenticação.
 * sessionStorage é preferido sobre localStorage pois tokens JWT são sensíveis
 * e sessionStorage é limpo quando a aba/janela é fechada, reduzindo exposição a XSS.
 */
function getAuthStorage(): Storage {
  return typeof window !== "undefined"
    ? window.sessionStorage
    : ({} as Storage);
}

export function loadAuthSession(): AuthSessionState {
  if (typeof window === "undefined") {
    return emptyAuthSession;
  }

  try {
    const raw = getAuthStorage().getItem(STORAGE_KEY);
    if (!raw) {
      return emptyAuthSession;
    }

    const parsed = JSON.parse(raw) as Partial<AuthSessionState>;
    return {
      ...emptyAuthSession,
      ...parsed,
      stage:
        parsed.stage === "authenticated" || parsed.temporaryMfaToken
          ? (parsed.stage ?? emptyAuthSession.stage)
          : emptyAuthSession.stage,
    };
  } catch {
    return emptyAuthSession;
  }
}

export function saveAuthSession(state: AuthSessionState) {
  if (typeof window === "undefined") {
    return;
  }

  const shouldPersist =
    !!state.refreshToken || !!state.accessToken || !!state.temporaryMfaToken;

  const storage = getAuthStorage();
  if (!shouldPersist) {
    storage.removeItem(STORAGE_KEY);
    return;
  }

  storage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function clearAuthSession() {
  if (typeof window === "undefined") {
    return;
  }

  getAuthStorage().removeItem(STORAGE_KEY);
}
