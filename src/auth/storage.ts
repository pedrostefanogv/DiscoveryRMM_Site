import type { AuthSessionState } from "./types";

const STORAGE_KEY = "discovery.auth.session.v1";

/**
 * Preferência "manter conectado" (persistida em localStorage, que sobrevive ao
 * fechamento da aba — é justamente o que a opção promete).
 *   "1" → tokens em localStorage  (sessão sobrevive a fechar o navegador)
 *   "0" → tokens em sessionStorage (padrão; apagados ao fechar a aba)
 */
const KEEP_SIGNED_IN_KEY = "discovery.auth.keep-signed-in.v1";

export const emptyAuthSession: AuthSessionState = {
  stage: "anonymous",
  accessToken: null,
  refreshToken: null,
  temporaryMfaToken: null,
  expiresAt: null,
  loginResponse: null,
};

type StorageKind = "local" | "session";

function resolveStorage(kind: StorageKind): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    // Modo privado/restrito pode lançar ao acessar o storage.
    return null;
  }
}

/**
 * Indica se o usuário optou por manter a sessão após fechar o navegador.
 * Lê direto do localStorage porque a preferência precisa sobreviver à sessão.
 */
export function isKeepSignedInEnabled(): boolean {
  const local = resolveStorage("local");
  if (!local) {
    return false;
  }

  try {
    return local.getItem(KEEP_SIGNED_IN_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Ativa/desativa "manter conectado".
 *
 * Migra a sessão existente entre localStorage e sessionStorage para que a
 * preferência valha imediatamente — sem exigir novo login. Ao desativar,
 * nenhum token permanece em localStorage.
 */
export function setKeepSignedInEnabled(enabled: boolean): void {
  const local = resolveStorage("local");
  const session = resolveStorage("session");
  if (!local || !session) {
    return;
  }

  try {
    const source = enabled ? session : local;
    const target = enabled ? local : session;
    const raw = source.getItem(STORAGE_KEY) ?? target.getItem(STORAGE_KEY);

    local.setItem(KEEP_SIGNED_IN_KEY, enabled ? "1" : "0");

    if (raw) {
      target.setItem(STORAGE_KEY, raw);
    }

    // Garante que o storage "desligado" nunca conserve tokens.
    (enabled ? session : local).removeItem(STORAGE_KEY);
  } catch {
    // Sem persistência a sessão segue apenas em memória; não interrompe o login.
  }
}

/**
 * Storage da sessão ativa, conforme a preferência "manter conectado".
 *
 * sessionStorage é o padrão (tokens JWT são sensíveis e o storage é limpo ao
 * fechar a aba, reduzindo exposição a XSS). Com "manter conectado" o usuário
 * aceita explicitamente o trade-off de persistir os tokens em localStorage
 * para não refazer o MFA a cada nova aba.
 */
function getAuthStorage(): Storage {
  return (
    resolveStorage(isKeepSignedInEnabled() ? "local" : "session") ??
    ({} as Storage)
  );
}

export function loadAuthSession(): AuthSessionState {
  if (typeof window === "undefined") {
    return emptyAuthSession;
  }

  try {
    const storage = getAuthStorage();
    let raw = storage.getItem(STORAGE_KEY);

    // Fallback: sessão gravada no outro storage (ex.: preferência alterada em
    // outra aba, ou sessão anterior à existência da opção). Migra ao encontrar.
    if (!raw) {
      const otherKind: StorageKind = isKeepSignedInEnabled() ? "session" : "local";
      const other = resolveStorage(otherKind);
      const otherRaw = other?.getItem(STORAGE_KEY) ?? null;
      if (otherRaw) {
        raw = otherRaw;
        storage.setItem(STORAGE_KEY, otherRaw);
        other?.removeItem(STORAGE_KEY);
      }
    }

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

/**
 * Remove a sessão dos DOIS storages: com "manter conectado" ativo, um resíduo
 * em localStorage faria o usuário voltar autenticado depois de um logout.
 * A preferência em si é preservada (o usuário não precisa remarcar a opção).
 */
export function clearAuthSession() {
  if (typeof window === "undefined") {
    return;
  }

  resolveStorage("local")?.removeItem(STORAGE_KEY);
  resolveStorage("session")?.removeItem(STORAGE_KEY);
}
