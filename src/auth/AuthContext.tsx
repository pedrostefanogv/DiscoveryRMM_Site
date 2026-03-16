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
  authApi,
  configureApiClient,
  type LoginRequest,
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

function resolveLoginStage(response: {
  firstAccessRequired: boolean;
  mfaRequired: boolean;
  mfaConfigured: boolean;
}): AuthStage {
  if (response.firstAccessRequired) {
    return "first-access";
  }

  if (response.mfaRequired && response.mfaConfigured) {
    return "mfa-assert-begin";
  }

  if (response.mfaRequired && !response.mfaConfigured) {
    return "mfa-register-begin";
  }

  return "anonymous";
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
      const nextState = applyTokenPair(tokens, sessionRef.current);
      setSession(nextState);
      return tokens.accessToken;
    } catch {
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
      // Logout local deve prosseguir mesmo se a revogacao falhar.
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

    setSession({
      stage: nextStage,
      accessToken: null,
      refreshToken: null,
      temporaryMfaToken: response.mfaToken,
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

  useEffect(() => {
    if (!session.accessToken || !session.refreshToken || !session.expiresAt) {
      return;
    }

    const refreshDelay = Math.max(session.expiresAt - Date.now() - 60_000, 5_000);
    const timer = window.setTimeout(() => {
      void refreshSession();
    }, refreshDelay);

    return () => {
      window.clearTimeout(timer);
    };
  }, [refreshSession, session.accessToken, session.expiresAt, session.refreshToken]);

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