import type { AuthSessionState } from "./types";

const STORAGE_KEY = "meduza.auth.session.v1";

export const emptyAuthSession: AuthSessionState = {
  stage: "anonymous",
  accessToken: null,
  refreshToken: null,
  temporaryMfaToken: null,
  expiresAt: null,
  loginResponse: null,
};

export function loadAuthSession(): AuthSessionState {
  if (typeof window === "undefined") {
    return emptyAuthSession;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
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

  if (!shouldPersist) {
    window.localStorage.removeItem(STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function clearAuthSession() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(STORAGE_KEY);
}
