import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ApiError,
  authApi,
  configureApiClient,
  type LoginRequest,
  type LoginResponse,
  type MfaRequirement,
  type TokenPair,
} from "@/api";
import { clearAuthSession, emptyAuthSession, loadAuthSession, saveAuthSession } from "./storage";
import type { AuthSessionState, AuthStage } from "./types";

interface AuthContextValue {
  session: AuthSessionState;
  isAuthenticated: boolean;
  isBootstrapping: boolean;
  login: (request: LoginRequest) => Promise<AuthStage>;
  completeAuthenticatedSession: (tokens: TokenPair) => Promise<void>;
  refreshSession: () => Promise<string | null>;
  logout: () => Promise<void>;
  setTemporaryStage: (stage: AuthStage) => void;
  clearTemporarySession: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readRoleMfaRequirement(response: LoginResponse): MfaRequirement {
  return response.roleMfaRequirement ?? response.RoleMfaRequirement ?? "None";
}

function readSessionTokens(response: LoginResponse): TokenPair | null {
  const accessToken = response.accessToken ?? response.AccessToken;
  const refreshToken = response.refreshToken ?? response.RefreshToken;
  const expiresInSeconds = response.expiresInSeconds ?? response.ExpiresInSeconds;

  if (!accessToken || !refreshToken || !expiresInSeconds) {
    return null;
  }

  return {
    accessToken,
    refreshToken,
    expiresInSeconds,
  };
}

function isSessionEstablished(response: LoginResponse): boolean {
  return Boolean(
    response.sessionEstablished ?? response.SessionEstablished ?? readSessionTokens(response),
  );
}

function resolveLoginStage(response: LoginResponse): AuthStage {
  if (response.firstAccessRequired) {
    return "first-access";
  }

  if (isSessionEstablished(response)) {
    return "authenticated";
  }

  if (!response.mfaRequired) {
    return "anonymous";
  }

  const mfaConfigured = response.mfaConfigured ?? true;
  const roleMfaRequirement = readRoleMfaRequirement(response);

  if (!mfaConfigured && roleMfaRequirement !== "None") {
    return "mfa-register-begin";
  }

  return "mfa-assert-begin";
}

function applyTokenPair(tokens: TokenPair, previous: AuthSessionState): AuthSessionState {
  return {
    ...previous,
    stage: "authenticated",
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: Date.now() + tokens.expiresInSeconds * 1000,
    temporaryMfaToken: null,
    loginResponse: null,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<AuthSessionState>(loadAuthSession);
  const [isBootstrapping, setIsBootstrapping] = useState(true);

  const accessTokenRef = useRef(session.accessToken);
  const refreshTokenRef = useRef(session.refreshToken);
  const sessionRef = useRef(session);

  // BUG-01: lastActivityAt / lastRefreshAttemptAt eram locais ao effect de inatividade,
  // reiniciando a cada mudança de sessão. Agora são refs persistentes.
  const lastActivityAtRef = useRef(Date.now());
  const lastRefreshAttemptAtRef = useRef(0);

  // BUG-02: refresh retry state — evita logout por erro de rede transitório
  const refreshRetryCountRef = useRef(0);
  const MAX_REFRESH_RETRIES = 3;
  const REFRESH_RETRY_BASE_DELAY_MS = 2_000; // backoff: 2s, 4s, 8s

  // Registra atividade do usuário para o mecanismo de inatividade
  const recordActivity = useCallback(() => {
    lastActivityAtRef.current = Date.now();
  }, []);

  useEffect(() => {
    accessTokenRef.current = session.accessToken;
    refreshTokenRef.current = session.refreshToken;
    sessionRef.current = session;
    saveAuthSession(session);
  }, [session]);

  const clearSession = useCallback(() => {
    clearAuthSession();
    setSession(emptyAuthSession);
    queryClient.clear();
    refreshRetryCountRef.current = 0;
  }, [queryClient]);

  const completeAuthenticatedSession = useCallback(async (tokens: TokenPair) => {
    setSession((previous) => applyTokenPair(tokens, previous));
  }, []);

  const refreshSession = useCallback(async () => {
    const refreshToken = refreshTokenRef.current;
    if (!refreshToken) {
      return null;
    }

    try {
      const tokens = await authApi.refresh({ refreshToken });
      refreshRetryCountRef.current = 0; // reset após sucesso
      const nextState = applyTokenPair(tokens, sessionRef.current);
      setSession(nextState);
      return tokens.accessToken;
    } catch (error: unknown) {
      // BUG-02: Distinguir erro de rede (fetch falhou) de erro HTTP (401/403).
      // Erro de rede → retry com backoff. Erro HTTP de auth → logout imediato.
      const isApiError =
        error instanceof ApiError ||
        (typeof error === "object" && error !== null && "status" in error);

      if (isApiError) {
        const status = (error as { status?: number }).status;
        // 401 Unauthorized ou 403 Forbidden → refresh token inválido/revogado
        if (status === 401 || status === 403) {
          clearSession();
          return null;
        }
        // Outros erros HTTP (500, 502, 503) → retry como erro de rede
      }

      // Erro de rede (TypeError, fetch failed) ou erro HTTP 5xx → retry com backoff
      refreshRetryCountRef.current += 1;
      if (refreshRetryCountRef.current <= MAX_REFRESH_RETRIES) {
        const delay =
          REFRESH_RETRY_BASE_DELAY_MS *
          Math.pow(2, refreshRetryCountRef.current - 1);
        console.warn(
          `[auth] Refresh falhou (tentativa ${refreshRetryCountRef.current}/${MAX_REFRESH_RETRIES}). ` +
            `Nova tentativa em ${delay}ms.`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        // Retorna o token atual se ainda válido, para não quebrar requests em andamento
        const currentAccessToken = accessTokenRef.current;
        if (currentAccessToken && (sessionRef.current.expiresAt ?? 0) > Date.now()) {
          return currentAccessToken;
        }
        return null;
      }

      // Esgotou tentativas → logout
      console.error("[auth] Refresh falhou após todas as tentativas. Encerrando sessão.");
      clearSession();
      return null;
    }
  }, [clearSession]);

  const logout = useCallback(async () => {
    const accessToken = accessTokenRef.current;
    const refreshToken = refreshTokenRef.current;

    setSession((previous) => ({ ...previous, stage: "logout" }));

    try {
      if (accessToken) {
        await authApi.logout(accessToken, refreshToken);
      }
    } catch {
      // Logout local deve prosseguir mesmo se a revogação falhar.
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const setTemporaryStage = useCallback((stage: AuthStage) => {
    setSession((previous) => ({
      ...previous,
      stage,
    }));
  }, []);

  const clearTemporarySession = useCallback(() => {
    setSession((previous) => ({
      ...previous,
      stage: previous.accessToken ? "authenticated" : "anonymous",
      temporaryMfaToken: null,
      loginResponse: null,
    }));
  }, []);

  const login = useCallback(async (request: LoginRequest) => {
    setSession((previous) => ({ ...previous, stage: "login-submitting" }));
    const response = await authApi.login(request);
    const nextStage = resolveLoginStage(response);
    const tokens = readSessionTokens(response);

    if (nextStage === "authenticated" && tokens) {
      setSession((previous) => ({
        ...applyTokenPair(tokens, previous),
        loginResponse: response,
      }));
      return nextStage;
    }

    setSession({
      stage: nextStage,
      accessToken: null,
      refreshToken: null,
      temporaryMfaToken: response.mfaToken ?? response.MfaToken ?? null,
      expiresAt: null,
      loginResponse: response,
    });

    return nextStage;
  }, []);

  useEffect(() => {
    configureApiClient({
      getAccessToken: () => accessTokenRef.current,
      refreshAccessToken: refreshSession,
      onAuthFailure: clearSession,
    });
  }, [clearSession, refreshSession]);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      const hasRefreshToken = !!refreshTokenRef.current;
      if (!hasRefreshToken) {
        setIsBootstrapping(false);
        return;
      }

      await refreshSession();
      if (!cancelled) {
        setIsBootstrapping(false);
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [refreshSession]);

  // BUG-01 corrigido: inatividade/refresh proativo usa refs persistentes em vez de
  // variáveis locais ao effect, que eram reiniciadas a cada mudança de sessão.
  // Se o usuário não interagir até a expiração do access token,
  // a sessão é encerrada e os tokens limpos (forçando novo login).
  // Se houver atividade recente, o token é renovado proativamente ~5min antes do fim.
  useEffect(() => {
    if (!session.accessToken || !session.refreshToken || !session.expiresAt) {
      return;
    }

    const REFRESH_THRESHOLD_MS = 5 * 60 * 1000; // janela em que renovamos antecipadamente se ativo
    const ACTIVITY_WINDOW_MS = 5 * 60 * 1000; // considera "ativo" se interagiu nos últimos 5min
    const REFRESH_THROTTLE_MS = 30_000;

    // Reinicia marcadores de atividade ao montar (nova sessão)
    lastActivityAtRef.current = Date.now();
    lastRefreshAttemptAtRef.current = 0;

    const activityEvents: (keyof WindowEventMap)[] = [
      "mousedown",
      "keydown",
      "touchstart",
      "scroll",
      "click",
    ];
    activityEvents.forEach((event) =>
      window.addEventListener(event, recordActivity, { passive: true } as AddEventListenerOptions),
    );

    const intervalId = window.setInterval(() => {
      const now = Date.now();
      const expiresAt = sessionRef.current.expiresAt ?? 0;
      const remaining = expiresAt - now;
      const idleFor = now - lastActivityAtRef.current;

      if (remaining <= 0) {
        console.warn("[auth] Sessão encerrada por inatividade. Tokens removidos.");
        void logout();
        return;
      }

      if (
        remaining < REFRESH_THRESHOLD_MS &&
        idleFor < ACTIVITY_WINDOW_MS &&
        now - lastRefreshAttemptAtRef.current > REFRESH_THROTTLE_MS
      ) {
        lastRefreshAttemptAtRef.current = now;
        void refreshSession();
      }
    }, 1_000);

    return () => {
      window.clearInterval(intervalId);
      activityEvents.forEach((event) => window.removeEventListener(event, recordActivity));
    };
  }, [logout, recordActivity, refreshSession, session.accessToken, session.expiresAt, session.refreshToken]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      isAuthenticated: !!session.accessToken,
      isBootstrapping,
      login,
      completeAuthenticatedSession,
      refreshSession,
      logout,
      setTemporaryStage,
      clearTemporarySession,
    }),
    [
      clearTemporarySession,
      completeAuthenticatedSession,
      isBootstrapping,
      login,
      logout,
      refreshSession,
      session,
      setTemporaryStage,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}