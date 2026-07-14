import { api, ApiError, getApiAccessToken } from "./client";
import type {
  Authenticator,
  NatsConnection as CoreNatsConnection,
  Subscription as CoreSubscription,
  WsConnectionOptions,
} from "@nats-io/nats-core";
import { natsSubjectMatches } from "@/utils/natsSubjects";
import { natsLogger, natsTelemetryLogger } from "@/utils/debugLogger";

type NatsConnection = Pick<
  CoreNatsConnection,
  "close" | "closed" | "isClosed" | "publish" | "subscribe"
>;

type Subscription = Pick<CoreSubscription, "unsubscribe"> &
  AsyncIterable<{ data: Uint8Array }>;

interface NatsCredentialsRequest {
  clientId?: string;
  siteId?: string;
}

export interface NatsCredentialsResponse {
  jwt: string;
  nkeySeed: string;
  publicKey: string;
  expiresAtUtc: string;
  publishSubjects: string[];
  subscribeSubjects: string[];
}

type NatsClientModule = {
  wsconnect: (options: WsConnectionOptions) => Promise<NatsConnection>;
  credsAuthenticator: (
    creds: Uint8Array | (() => Uint8Array),
  ) => Authenticator;
  tokenAuthenticator: (token: string | (() => string)) => Authenticator;
};

export type NatsAuthMode = "auth_token" | "jwt_credentials";

const CREDENTIALS_REFRESH_SKEW_MS = 60_000;

function sanitizeNatsUrl(url: string): string {
  const normalized = url.trim();
  if (!normalized) return "";

  try {
    const parsed = new URL(normalized);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    const queryIndex = normalized.indexOf("?");
    return queryIndex >= 0 ? normalized.slice(0, queryIndex) : normalized;
  }
}

function getErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") {
    return null;
  }

  const err = error as { code?: unknown; name?: unknown };
  if (typeof err.code === "string" && err.code.trim().length > 0) {
    return err.code;
  }

  if (typeof err.name === "string" && err.name.trim().length > 0) {
    return err.name;
  }

  return null;
}

function normalizeNatsUrl(url: string): string {
  const trimmed = url.trim();

  if (!trimmed) return "";
  if (trimmed.startsWith("http://")) {
    return `ws://${trimmed.slice("http://".length)}`;
  }
  if (trimmed.startsWith("https://")) {
    return `wss://${trimmed.slice("https://".length)}`;
  }
  if (trimmed.startsWith("ws://") || trimmed.startsWith("wss://")) {
    return trimmed;
  }
  if (trimmed.startsWith("nats://")) {
    return `ws://${trimmed.slice("nats://".length)}`;
  }
  if (trimmed.startsWith("tls://")) {
    return `wss://${trimmed.slice("tls://".length)}`;
  }

  // Path-only values (e.g. "/nats/") resolve against current origin.
  if (trimmed.startsWith("/")) {
    try {
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      return `${proto}//${window.location.host}${trimmed}`;
    } catch {
      return `wss://${trimmed}`;
    }
  }

  // Bare host/path values are mapped to secure websocket in browser contexts.
  if (!trimmed.includes("://")) {
    return `wss://${trimmed}`;
  }

  return trimmed;
}

function buildCredsFile(credentials: NatsCredentialsResponse): string {
  return `-----BEGIN NATS USER JWT-----\n${credentials.jwt}\n------END NATS USER JWT------\n\n************************* IMPORTANT *************************\nNKEY Seed printed below can be used sign and prove identity.\nNKEYs are sensitive and should be treated as secrets.\n\n-----BEGIN USER NKEY SEED-----\n${credentials.nkeySeed}\n------END USER NKEY SEED------\n`;
}

function isCredentialsExpiring(credentials: NatsCredentialsResponse): boolean {
  return (
    new Date(credentials.expiresAtUtc).getTime() <=
    Date.now() + CREDENTIALS_REFRESH_SKEW_MS
  );
}

function isAuthorizationNatsError(error: unknown): boolean {
  if (error instanceof ApiError && [401, 403].includes(error.status)) {
    return true;
  }

  if (error && typeof error === "object") {
    const err = error as { name?: unknown; message?: unknown };
    const name = typeof err.name === "string" ? err.name : "";
    const message = typeof err.message === "string" ? err.message : "";
    if (
      name === "AuthorizationError" ||
      /authorization violation|missing auth token|authentication token/i.test(
        message,
      )
    ) {
      return true;
    }
  }

  return false;
}

function classifyNatsErrorType(error: unknown): "auth" | "network" {
  return isAuthorizationNatsError(error) ? "auth" : "network";
}

function getNatsErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  if (error && typeof error === "object") {
    const err = error as { message?: unknown };
    if (typeof err.message === "string" && err.message.trim().length > 0) {
      return err.message;
    }
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  return "Unknown NATS error";
}

function buildMissingAuthTokenError(): Error {
  const error = new Error(
    "Missing auth token for NATS connect in auth_token mode",
  );
  error.name = "MissingAuthTokenError";
  return error;
}

function isNonRetryableNatsError(error: unknown): boolean {
  if (
    error instanceof ApiError &&
    [400, 401, 403, 404, 503].includes(error.status)
  ) {
    return true;
  }

  if (isAuthorizationNatsError(error)) {
    return true;
  }

  return false;
}

export interface DashboardEvent {
  eventType: string;
  data: Record<string, unknown> | null;
  timestampUtc: string;
  clientId?: string | null;
  siteId?: string | null;
}

export interface NatsConfig {
  url: string;
  enabled: boolean;
  authMode?: NatsAuthMode;
  clientId?: string;
  siteId?: string;
  scopeMode?: "replace" | "preserve";
}

export type NatsConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "auth_error";

export type NatsConnectionErrorType = "auth" | "network" | null;

export interface NatsConnectionDiagnostics {
  lastErrorType: NatsConnectionErrorType;
  lastErrorMessage: string | null;
  lastErrorAtUtc: string | null;
}

type NatsTelemetryLevel = "info" | "warn" | "error";

class NatsService {
  private config: NatsConfig;
  private connection: NatsConnection | null = null;
  private subscriptions: Map<string, Subscription> = new Map();
  private listeners: Map<string, Set<(event: DashboardEvent) => void>> =
    new Map();
  private credentials: NatsCredentialsResponse | null = null;
  private credentialsInFlight: Promise<NatsCredentialsResponse> | null = null;
  private stateListeners = new Set<(state: NatsConnectionState) => void>();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private warnedInvalidUrl = false;
  private warnedUnavailableClient = false;
  private connectionState: NatsConnectionState = "disconnected";
  private connectInFlight: Promise<boolean> | null = null;
  private manualDisconnect = false;
  private pendingReconnect = false;
  private lastErrorType: NatsConnectionErrorType = null;
  private lastErrorMessage: string | null = null;
  private lastErrorAtUtc: string | null = null;
  private readonly maxAuthRefreshAttempts = 1;
  private telemetrySequence = 0;
  private connectAttemptSequence = 0;

  constructor(config: NatsConfig) {
    this.config = {
      ...config,
      authMode: config.authMode ?? "auth_token",
    };
  }

  updateConfig(config: NatsConfig) {
    const scopeMode = config.scopeMode ?? "replace";
    const authMode = config.authMode ?? this.config.authMode ?? "auth_token";
    const nextConfig: NatsConfig = {
      ...this.config,
      ...config,
      authMode,
      clientId:
        scopeMode === "preserve" && config.clientId === undefined
          ? this.config.clientId
          : config.clientId,
      siteId:
        scopeMode === "preserve" && config.siteId === undefined
          ? this.config.siteId
          : config.siteId,
      scopeMode,
    };

    const scopeChanged =
      this.config.clientId !== nextConfig.clientId ||
      this.config.siteId !== nextConfig.siteId;
    const authModeChanged = this.config.authMode !== nextConfig.authMode;
    const connectionInputsChanged =
      this.config.url !== nextConfig.url ||
      this.config.enabled !== nextConfig.enabled ||
      authModeChanged;

    const previousConfig = this.config;

    this.config = nextConfig;

    if (scopeChanged || connectionInputsChanged) {
      this.emitTelemetry("info", "config_updated", {
        scopeChanged,
        connectionInputsChanged,
        previousEnabled: previousConfig.enabled,
        nextEnabled: nextConfig.enabled,
        previousUrl: sanitizeNatsUrl(previousConfig.url),
        nextUrl: sanitizeNatsUrl(nextConfig.url),
        previousAuthMode: previousConfig.authMode ?? "auth_token",
        nextAuthMode: nextConfig.authMode ?? "auth_token",
      });
    }

    if (scopeChanged || authModeChanged) {
      this.invalidateCredentials();
      this.emitTelemetry("info", "credentials_invalidated", {
        reason: scopeChanged && authModeChanged
          ? "scope_changed_and_auth_mode_changed"
          : scopeChanged
            ? "scope_changed"
            : "auth_mode_changed",
      });
    }

    if (scopeChanged || connectionInputsChanged) {
      this.restartConnection();
    }
  }

  private setConnectionState(state: NatsConnectionState) {
    if (this.connectionState === state) return;

    const previousState = this.connectionState;
    natsLogger.log("Estado:", { anterior: previousState, novo: state, tentativa: this.reconnectAttempts, subjects: Array.from(this.subscriptions.keys()) });
    this.connectionState = state;
    this.emitTelemetry("info", "connection_state_changed", {
      previousState,
      nextState: state,
    });
    this.stateListeners.forEach((listener) => listener(state));
  }

  private emitTelemetry(
    level: NatsTelemetryLevel,
    event: string,
    details: Record<string, unknown> = {},
  ) {
    const payload = {
      source: "frontend.nats",
      sequence: ++this.telemetrySequence,
      event,
      atUtc: new Date().toISOString(),
      state: this.connectionState,
      reconnectAttempts: this.reconnectAttempts,
      authMode: this.config.authMode ?? "auth_token",
      hasConnection: this.connection?.isClosed() === false,
      listenersCount: this.listeners.size,
      subscriptionsCount: this.subscriptions.size,
      clientId: this.config.clientId ?? null,
      siteId: this.config.siteId ?? null,
      ...details,
    };

    if (level === "error") {
      natsTelemetryLogger.error(payload);
      return;
    }

    if (level === "warn") {
      natsTelemetryLogger.warn(payload);
      return;
    }

    natsTelemetryLogger.info(payload);
  }

  private async loadClient(): Promise<NatsClientModule | null> {
    try {
      const mod = await import("@nats-io/nats-core");
      return {
        wsconnect: mod.wsconnect as (
          options: WsConnectionOptions,
        ) => Promise<NatsConnection>,
        credsAuthenticator: mod.credsAuthenticator as (
          creds: Uint8Array | (() => Uint8Array),
        ) => Authenticator,
        tokenAuthenticator: mod.tokenAuthenticator as (
          token: string | (() => string),
        ) => Authenticator,
      };
    } catch {
      if (!this.warnedUnavailableClient) {
        this.warnedUnavailableClient = true;
        natsLogger.warn(
          "NATS WebSocket client (@nats-io/nats-core) não disponível. Realtime NATS desativado.",
        );
      }
      return null;
    }
  }

  private getResolvedUrl(): string {
    return normalizeNatsUrl(this.config.url);
  }

  private isBrowserWsUrl(url: string): boolean {
    if (typeof window === "undefined") {
      return true;
    }

    return url.startsWith("ws://") || url.startsWith("wss://");
  }

  private clearReconnectTimer() {
    if (!this.reconnectTimer) return;

    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  setPreSuppliedCredentials(creds: NatsCredentialsResponse): void {
    this.credentials = creds;
  }

  private invalidateCredentials() {
    this.credentials = null;
    this.credentialsInFlight = null;
  }

  private clearConnectionError() {
    this.lastErrorType = null;
    this.lastErrorMessage = null;
    this.lastErrorAtUtc = null;
  }

  private updateConnectionError(error: unknown): "auth" | "network" {
    const type = classifyNatsErrorType(error);
    this.lastErrorType = type;
    this.lastErrorMessage = getNatsErrorMessage(error);
    this.lastErrorAtUtc = new Date().toISOString();
    return type;
  }

  private restartConnection() {
    if (this.connectInFlight) {
      this.pendingReconnect = true;
      this.emitTelemetry("warn", "restart_deferred_connect_inflight");
      return;
    }

    this.clearReconnectTimer();
    this.reconnectAttempts = 0;

    const activeConnection = this.connection;
    const hadActiveConnection = Boolean(
      activeConnection && !activeConnection.isClosed(),
    );
    this.connection = null;
    this.subscriptions.clear();

    this.emitTelemetry("info", "restart_connection", {
      hadActiveConnection,
    });

    if (activeConnection && !activeConnection.isClosed()) {
      void activeConnection.close().catch((error) => {
        natsLogger.warn("Failed to close NATS connection during restart:", error);
      });
    }

    this.clearConnectionError();
    this.setConnectionState("disconnected");

    if (this.listeners.size > 0 && this.config.enabled) {
      void this.connect();
    }
  }

  private async issueCredentials(): Promise<NatsCredentialsResponse> {
    const request: NatsCredentialsRequest = {
      clientId: this.config.clientId,
      siteId: this.config.siteId,
    };

    this.emitTelemetry("info", "credentials_issue_start", {
      hasClientId: Boolean(request.clientId),
      hasSiteId: Boolean(request.siteId),
    });

    try {
      const response = await api.post<NatsCredentialsResponse>(
        "/api/v1/nats-auth/user/credentials",
        request,
      );
      this.emitTelemetry("info", "credentials_issue_success", {
        expiresAtUtc: response.expiresAtUtc,
        subscribeSubjectsCount: response.subscribeSubjects.length,
        publishSubjectsCount: response.publishSubjects.length,
      });
      return response;
    } catch (error) {
      const errorType = classifyNatsErrorType(error);
      this.emitTelemetry(errorType === "auth" ? "warn" : "error", "credentials_issue_failure", {
        errorType,
        errorMessage: getNatsErrorMessage(error),
        errorCode: getErrorCode(error),
      });
      throw error;
    }
  }

  private async getCredentials(): Promise<NatsCredentialsResponse> {
    if (this.credentials && !isCredentialsExpiring(this.credentials)) {
      this.emitTelemetry("info", "credentials_cache_hit", {
        expiresAtUtc: this.credentials.expiresAtUtc,
      });
      return this.credentials;
    }

    if (this.credentialsInFlight) {
      this.emitTelemetry("info", "credentials_inflight_joined");
      return this.credentialsInFlight;
    }

    this.credentialsInFlight = this.issueCredentials()
      .then((credentials) => {
        this.credentials = credentials;
        return credentials;
      })
      .finally(() => {
        this.credentialsInFlight = null;
      });

    return this.credentialsInFlight;
  }

  private getAuthMode(): NatsAuthMode {
    return this.config.authMode ?? "auth_token";
  }

  private async createAuthenticator(
    client: NatsClientModule,
    connectAttemptId: number,
    authAttempt: number,
  ): Promise<Authenticator> {
    const authMode = this.getAuthMode();

    if (authMode === "auth_token") {
      const accessToken = getApiAccessToken()?.trim();
      if (!accessToken) {
        throw buildMissingAuthTokenError();
      }

      this.emitTelemetry("info", "connect_authenticator_selected", {
        authMode,
        connectAttemptId,
        authAttempt,
      });

      return client.tokenAuthenticator(accessToken);
    }

    const credentials = await this.getCredentials();

    this.emitTelemetry("info", "connect_authenticator_selected", {
      authMode,
      connectAttemptId,
      authAttempt,
      subscribeSubjectsCount: credentials.subscribeSubjects.length,
    });

    return client.credsAuthenticator(
      new TextEncoder().encode(buildCredsFile(credentials)),
    );
  }

  private watchConnection(connection: NatsConnection) {
    void connection.closed().then((error) => {
      if (this.connection !== connection) {
        return;
      }

      this.connection = null;
      const subjects = Array.from(this.subscriptions.keys());
      this.subscriptions.clear();

      if (this.manualDisconnect) {
        this.manualDisconnect = false;
        natsLogger.log("Desconexão manual, não vai reconectar.");
        this.emitTelemetry("info", "connection_closed_manual", {
          subscribedSubjects: subjects,
        });
        this.clearConnectionError();
        this.setConnectionState("disconnected");
        return;
      }

      if (error) {
        const errorType = this.updateConnectionError(error);
        if (errorType === "auth") {
          this.invalidateCredentials();
          this.setConnectionState("auth_error");
          this.emitTelemetry("warn", "connection_closed_auth_error", {
            errorMessage: getNatsErrorMessage(error),
            errorCode: getErrorCode(error),
            subscribedSubjects: subjects,
          });
          natsLogger.warn("Conexão encerrada por erro de autorização.", {
            error,
            subjects,
          });
          return;
        }

        this.emitTelemetry("warn", "connection_closed_error", {
          errorType,
          errorMessage: getNatsErrorMessage(error),
          errorCode: getErrorCode(error),
          subscribedSubjects: subjects,
        });

        natsLogger.warn("Conexão fechada com erro:", { error, subjects, reconnectAttempts: this.reconnectAttempts });
      } else {
        this.clearConnectionError();
        this.emitTelemetry("info", "connection_closed_clean", {
          subscribedSubjects: subjects,
        });
        natsLogger.log("Conexão fechada (sem erro).", { subjects, reconnectAttempts: this.reconnectAttempts });
      }

      this.scheduleReconnect();
    });
  }

  private async ensureSubjectSubscription(subject: string): Promise<boolean> {
    if (!this.connection) {
      this.emitTelemetry("warn", "subscribe_subject_skipped_no_connection", {
        subject,
      });
      return false;
    }

    if (this.subscriptions.has(subject)) {
      this.emitTelemetry("info", "subscribe_subject_already_active", {
        subject,
      });
      return true;
    }

    try {
      this.emitTelemetry("info", "subscribe_subject_start", {
        subject,
      });
      natsLogger.log("Inscrevendo em subject:", subject);
      const subscription = this.connection.subscribe(subject) as Subscription;
      this.subscriptions.set(subject, subscription);
      this.emitTelemetry("info", "subscribe_subject_success", {
        subject,
      });
      natsLogger.log("Inscrito em:", subject, "(subscriptions ativas:", this.subscriptions.size, ")");

      void (async () => {
        try {
          for await (const msg of subscription) {
            try {
              const raw = new TextDecoder().decode(msg.data);
              const data = JSON.parse(raw);
              natsLogger.log("Mensagem recebida em", subject, ":", typeof data === "object" ? Object.keys(data).join(", ") : raw.slice(0, 200));
              const listeners = this.listeners.get(subject);
              if (listeners) {
                listeners.forEach((listener) => {
                  try {
                    listener(data);
                  } catch (error) {
                    natsLogger.error("Error in NATS listener:", error);
                  }
                });
              }
            } catch (error) {
              natsLogger.error("Error parsing NATS message:", error);
            }
          }
        } catch (error) {
          if (!this.connection?.isClosed()) {
            natsLogger.error(`Failed to read NATS subscription ${subject}:`, error);
          }
        } finally {
          if (this.subscriptions.get(subject) === subscription) {
            this.subscriptions.delete(subject);
          }
        }
      })();

      return true;
    } catch (error) {
      this.emitTelemetry("warn", "subscribe_subject_failure", {
        subject,
        errorMessage: getNatsErrorMessage(error),
        errorCode: getErrorCode(error),
      });
      natsLogger.error(`Failed to subscribe to ${subject}:`, error);
      return false;
    }
  }

  private async restoreSubscriptions(): Promise<void> {
    let restoredCount = 0;
    let failedCount = 0;

    for (const subject of this.listeners.keys()) {
      const restored = await this.ensureSubjectSubscription(subject);
      if (!restored) {
        failedCount++;
        natsLogger.warn("Falha ao restaurar subject:", subject);
      } else {
        restoredCount++;
      }
    }

    if (restoredCount > 0 || failedCount > 0) {
      this.emitTelemetry(failedCount > 0 ? "warn" : "info", "restore_subscriptions_result", {
        restoredCount,
        failedCount,
      });
    }
  }

  async connect(): Promise<boolean> {
    this.emitTelemetry("info", "connect_requested", {
      hasExistingConnection: this.connection?.isClosed() === false,
    });

    if (this.connection?.isClosed()) {
      this.connection = null;
      this.subscriptions.clear();
      this.setConnectionState("disconnected");
    }

    if (this.connection) {
      this.emitTelemetry("info", "connect_short_circuit_connected");
      this.clearConnectionError();
      this.setConnectionState("connected");
      return true;
    }

    if (this.connectInFlight) {
      this.emitTelemetry("info", "connect_join_inflight");
      return this.connectInFlight;
    }

    const url = this.getResolvedUrl();

    if (!this.config.enabled || !url) {
      this.emitTelemetry("warn", "connect_skipped_invalid_config", {
        enabled: this.config.enabled,
        hasUrl: Boolean(url),
      });
      this.setConnectionState("disconnected");
      return false;
    }

    if (!this.isBrowserWsUrl(url)) {
      if (!this.warnedInvalidUrl) {
        this.warnedInvalidUrl = true;
        natsLogger.warn(
          "NATS desativado no browser: use VITE_NATS_URL com ws://, wss://, nats:// ou tls://.",
        );
      }
      this.emitTelemetry("warn", "connect_skipped_non_browser_url", {
        url: sanitizeNatsUrl(url),
      });
      this.setConnectionState("disconnected");
      return false;
    }

    const client = await this.loadClient();
    if (!client) {
      this.emitTelemetry("warn", "connect_skipped_client_unavailable");
      this.setConnectionState("disconnected");
      return false;
    }

    this.setConnectionState(
      this.reconnectAttempts > 0 ? "reconnecting" : "connecting",
    );

    this.connectInFlight = (async () => {
      this.manualDisconnect = false;
      const connectAttemptId = ++this.connectAttemptSequence;
      const authMode = this.getAuthMode();
      const maxAuthAttempts =
        authMode === "jwt_credentials" ? this.maxAuthRefreshAttempts : 0;

      this.emitTelemetry("info", "connect_attempt_start", {
        connectAttemptId,
        authMode,
        url: sanitizeNatsUrl(url),
      });

      for (
        let authAttempt = 0;
        authAttempt <= maxAuthAttempts;
        authAttempt++
      ) {
        try {
          this.emitTelemetry("info", "connect_auth_attempt_start", {
            connectAttemptId,
            authMode,
            authAttempt,
          });

          const authenticator = await this.createAuthenticator(
            client,
            connectAttemptId,
            authAttempt,
          );

          this.connection = await client.wsconnect({
            servers: [url],
            authenticator,
          });
          this.reconnectAttempts = 0;
          this.clearReconnectTimer();
          this.watchConnection(this.connection);
          await this.restoreSubscriptions();
          this.clearConnectionError();
          this.setConnectionState("connected");
          this.emitTelemetry("info", "connect_attempt_success", {
            connectAttemptId,
            authMode,
            authAttempt,
            restoredSubscriptions: this.subscriptions.size,
            url: sanitizeNatsUrl(url),
          });
          natsLogger.info(
            "NATS conectado em",
            url,
            this.subscriptions.size > 0
              ? `(restaurou ${this.subscriptions.size} subscrições)`
              : "",
          );
          return true;
        } catch (error) {
          this.connection = null;
          this.subscriptions.clear();
          const errorType = this.updateConnectionError(error);
          const nonRetryable = isNonRetryableNatsError(error);
          this.emitTelemetry(errorType === "auth" ? "warn" : "error", "connect_attempt_failure", {
            connectAttemptId,
            authMode,
            authAttempt,
            errorType,
            errorMessage: getNatsErrorMessage(error),
            errorCode: getErrorCode(error),
            nonRetryable,
          });
          natsLogger.error("Failed to connect to NATS:", error);

          const canRetryWithFreshCredentials =
            authMode === "jwt_credentials" &&
            errorType === "auth" &&
            authAttempt < maxAuthAttempts;
          if (canRetryWithFreshCredentials) {
            this.invalidateCredentials();
            this.emitTelemetry("warn", "connect_auth_refresh_retry", {
              connectAttemptId,
              authMode,
              failedAuthAttempt: authAttempt,
              nextAuthAttempt: authAttempt + 1,
            });
            natsLogger.warn(
              "AuthorizationError no CONNECT. Reemitindo credencial e tentando novamente.",
            );
            continue;
          }

          if (errorType === "auth") {
            this.invalidateCredentials();
            this.setConnectionState("auth_error");
            this.emitTelemetry("warn", "connect_auth_failure_terminal", {
              connectAttemptId,
              authMode,
              authAttempt,
            });
            return false;
          }

          this.setConnectionState("disconnected");
          if (!nonRetryable) {
            this.scheduleReconnect();
          }
          return false;
        }
      }

      this.setConnectionState("disconnected");
      return false;
    })();

    try {
      return await this.connectInFlight;
    } finally {
      this.connectInFlight = null;

      if (this.pendingReconnect) {
        this.pendingReconnect = false;
        this.emitTelemetry("info", "connect_pending_restart_execute");
        this.restartConnection();
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.connectInFlight || this.reconnectTimer) {
      this.emitTelemetry("info", "reconnect_schedule_skipped", {
        hasConnectInFlight: Boolean(this.connectInFlight),
        hasReconnectTimer: Boolean(this.reconnectTimer),
      });
      natsLogger.log("Reconexão já agendada ou em voo, ignorando.");
      return;
    }

    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      this.setConnectionState("reconnecting");
      const delay =
        this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
      const cappedDelay = Math.min(delay, 30000);
      this.emitTelemetry("warn", "reconnect_scheduled", {
        attempt: this.reconnectAttempts,
        delayMs: cappedDelay,
      });
      natsLogger.log("Agendando reconexão", { tentativa: this.reconnectAttempts, max: this.maxReconnectAttempts, delay: cappedDelay });
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        this.emitTelemetry("info", "reconnect_attempt_execute", {
          attempt: this.reconnectAttempts,
        });
        natsLogger.log("Executando reconexão (tentativa", this.reconnectAttempts, ")");
        void this.connect();
      }, cappedDelay);
      return;
    }

    this.emitTelemetry("error", "reconnect_exhausted", {
      maxReconnectAttempts: this.maxReconnectAttempts,
    });
    natsLogger.log("Máximo de tentativas de reconexão atingido (", this.maxReconnectAttempts, "). Desconectando.");
    this.setConnectionState("disconnected");
  }

  async subscribe(
    subject: string,
    callback: (event: DashboardEvent) => void,
    options?: { connectIfNeeded?: boolean },
  ): Promise<boolean> {
    if (!this.listeners.has(subject)) {
      this.listeners.set(subject, new Set());
    }
    this.listeners.get(subject)!.add(callback);
    natsLogger.log("subscribe() chamado para:", subject, "(listeners:", this.listeners.get(subject)?.size, ")");

    const connectIfNeeded = options?.connectIfNeeded ?? true;
    this.emitTelemetry("info", "subscribe_requested", {
      subject,
      connectIfNeeded,
      listenersForSubject: this.listeners.get(subject)?.size ?? 0,
    });

    if (!this.connection) {
      if (!connectIfNeeded) {
        this.emitTelemetry("warn", "subscribe_aborted_no_connection", {
          subject,
        });
        natsLogger.warn("Cannot subscribe sem conexão ativa para subject:", subject);
        return false;
      }

      natsLogger.log("Sem conexão ativa, conectando antes de subscrever...");
      const connected = await this.connect();
      if (!connected) {
        this.emitTelemetry("warn", "subscribe_aborted_connect_failed", {
          subject,
          diagnostics: this.getConnectionDiagnostics(),
        });
        natsLogger.warn("Conexão falhou antes de subscrever:", subject);
        return false;
      }
    }

    if (!this.connection) {
      this.emitTelemetry("warn", "subscribe_aborted_not_connected", {
        subject,
      });
      natsLogger.warn("Cannot subscribe: NATS not connected para subject:", subject);
      return false;
    }

    if (!this.canSubscribeToSubject(subject)) {
      this.emitTelemetry("warn", "subscribe_blocked_allow_list", {
        subject,
        allowedSubjectsCount: this.getAllowedSubscribeSubjects().length,
      });
      natsLogger.warn(
        "Subject fora da allow-list do token, ignorando:",
        subject,
      );
      return false;
    }

    const subscribed = await this.ensureSubjectSubscription(subject);
    this.emitTelemetry(subscribed ? "info" : "warn", "subscribe_result", {
      subject,
      subscribed,
    });
    return subscribed;
  }

  unsubscribe(
    subject: string,
    callback: (event: DashboardEvent) => void,
  ): void {
    const listeners = this.listeners.get(subject);
    if (listeners) {
      listeners.delete(callback);
      natsLogger.log("unsubscribe() chamado para:", subject, "(listeners restantes:", listeners.size, ")");
      this.emitTelemetry("info", "unsubscribe_requested", {
        subject,
        listenersRemaining: listeners.size,
      });
      if (listeners.size === 0) {
        this.listeners.delete(subject);
      }
    }

    // Only unsubscribe from NATS if no more listeners
    if (!this.listeners.has(subject)) {
      const subscription = this.subscriptions.get(subject);
      if (subscription) {
        subscription.unsubscribe();
        this.subscriptions.delete(subject);
        this.emitTelemetry("info", "unsubscribe_subject_detached", {
          subject,
        });
      }
    }
  }

  async publish(subject: string, data: Record<string, unknown>): Promise<void> {
    if (!this.connection) {
      const connected = await this.connect();
      if (!connected) {
        throw new Error("NATS not connected");
      }
    }

    if (!this.connection) {
      throw new Error("NATS not connected");
    }

    this.emitTelemetry("info", "publish", {
      subject,
      payloadKeys: Object.keys(data),
    });
    this.connection.publish(subject, new TextEncoder().encode(JSON.stringify(data)));
  }

  async disconnect(): Promise<void> {
    this.emitTelemetry("info", "disconnect_requested", {
      activeSubscriptions: this.subscriptions.size,
      activeListeners: this.listeners.size,
    });
    this.manualDisconnect = true;
    this.clearReconnectTimer();

    // Unsubscribe from all subjects
    for (const subscription of this.subscriptions.values()) {
      subscription.unsubscribe();
    }
    this.subscriptions.clear();
    this.listeners.clear();

    if (this.connection) {
      await this.connection.close();
      this.connection = null;
    }

    this.invalidateCredentials();
    this.clearConnectionError();
    this.manualDisconnect = false;
    this.setConnectionState("disconnected");
    this.emitTelemetry("info", "disconnect_completed");
  }

  isConnected(): boolean {
    return this.connection?.isClosed() === false;
  }

  getConnectionState(): NatsConnectionState {
    if (this.connection?.isClosed() === false) {
      return "connected";
    }

    return this.connectionState;
  }

  getAllowedSubscribeSubjects(): readonly string[] {
    return this.credentials?.subscribeSubjects ?? [];
  }

  canSubscribeToSubject(subject: string): boolean {
    const normalizedSubject = subject.trim();
    if (!normalizedSubject) {
      return false;
    }

    const allowSubjects = this.getAllowedSubscribeSubjects();
    if (allowSubjects.length === 0) {
      return this.getAuthMode() === "auth_token";
    }

    return allowSubjects.some((pattern) =>
      natsSubjectMatches(pattern, normalizedSubject),
    );
  }

  getConnectionDiagnostics(): NatsConnectionDiagnostics {
    return {
      lastErrorType: this.lastErrorType,
      lastErrorMessage: this.lastErrorMessage,
      lastErrorAtUtc: this.lastErrorAtUtc,
    };
  }

  onConnectionStateChange(listener: (state: NatsConnectionState) => void) {
    this.stateListeners.add(listener);
    listener(this.getConnectionState());

    return () => {
      this.stateListeners.delete(listener);
    };
  }
}

let natsService: NatsService | null = null;

export function getNatsService(config?: NatsConfig): NatsService {
  if (!natsService && config) {
    natsService = new NatsService(config);
  } else if (natsService && config) {
    natsService.updateConfig(config);
  }
  return (
    natsService ||
    new NatsService({ url: "", enabled: false, authMode: "auth_token" })
  );
}

export function resetNatsService(): void {
  natsService = null;
}
