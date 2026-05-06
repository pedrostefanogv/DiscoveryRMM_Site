import { api, ApiError } from "./client";
import type {
  Authenticator,
  NatsConnection as CoreNatsConnection,
  Subscription as CoreSubscription,
  WsConnectionOptions,
} from "@nats-io/nats-core";
import { natsSubjectMatches } from "@/utils/natsSubjects";

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

interface NatsCredentialsResponse {
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
};

const CREDENTIALS_REFRESH_SKEW_MS = 60_000;

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

function isNonRetryableNatsError(error: unknown): boolean {
  if (
    error instanceof ApiError &&
    [400, 401, 403, 404, 503].includes(error.status)
  ) {
    return true;
  }

  // O cliente @nats-io/nats-core lanÃ§a NatsError com nome "AuthorizationError"
  // quando o broker rejeita as credenciais (ex.: callout devolveu erro,
  // accountSeed divergente). Reconectar nÃ£o resolve â€” evita loop no console.
  if (error && typeof error === "object") {
    const err = error as { name?: unknown; message?: unknown; code?: unknown };
    const name = typeof err.name === "string" ? err.name : "";
    const message = typeof err.message === "string" ? err.message : "";
    if (
      name === "AuthorizationError" ||
      /authorization violation/i.test(message)
    ) {
      return true;
    }
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
  clientId?: string;
  siteId?: string;
  scopeMode?: "replace" | "preserve";
}

export type NatsConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting";

class NatsService {
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
  private connectInFlight: Promise<void> | null = null;
  private manualDisconnect = false;
  private pendingReconnect = false;

  constructor(private config: NatsConfig) {}

  updateConfig(config: NatsConfig) {
    const scopeMode = config.scopeMode ?? "replace";
    const nextConfig: NatsConfig = {
      ...this.config,
      ...config,
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
    const connectionInputsChanged =
      this.config.url !== nextConfig.url ||
      this.config.enabled !== nextConfig.enabled;

    this.config = nextConfig;

    if (scopeChanged) {
      this.credentials = null;
      this.credentialsInFlight = null;
    }

    if (scopeChanged || connectionInputsChanged) {
      this.restartConnection();
    }
  }

  private setConnectionState(state: NatsConnectionState) {
    if (this.connectionState === state) return;

    console.log("[NATS] Estado:", { anterior: this.connectionState, novo: state, tentativa: this.reconnectAttempts, subjects: Array.from(this.subscriptions.keys()) });
    this.connectionState = state;
    this.stateListeners.forEach((listener) => listener(state));
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
      };
    } catch {
      if (!this.warnedUnavailableClient) {
        this.warnedUnavailableClient = true;
        console.warn(
          "NATS WebSocket client (@nats-io/nats-core) nao disponivel. Realtime NATS desativado.",
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

  private restartConnection() {
    if (this.connectInFlight) {
      this.pendingReconnect = true;
      return;
    }

    this.clearReconnectTimer();
    this.reconnectAttempts = 0;

    const activeConnection = this.connection;
    this.connection = null;
    this.subscriptions.clear();

    if (activeConnection && !activeConnection.isClosed()) {
      void activeConnection.close().catch((error) => {
        console.warn("Failed to close NATS connection during restart:", error);
      });
    }

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

    return api.post<NatsCredentialsResponse>(
      "/api/v1/nats-auth/user/credentials",
      request,
    );
  }

  private async getCredentials(): Promise<NatsCredentialsResponse> {
    if (this.credentials && !isCredentialsExpiring(this.credentials)) {
      return this.credentials;
    }

    if (this.credentialsInFlight) {
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
        console.log("[NATS] Desconexão manual, não vai reconectar.");
        this.setConnectionState("disconnected");
        return;
      }

      if (error) {
        console.warn("[NATS] Conexão fechada com erro:", { error, subjects, reconnectAttempts: this.reconnectAttempts });
      } else {
        console.log("[NATS] Conexão fechada (sem erro).", { subjects, reconnectAttempts: this.reconnectAttempts });
      }

      this.scheduleReconnect();
    });
  }

  private async ensureSubjectSubscription(subject: string): Promise<void> {
    if (!this.connection || this.subscriptions.has(subject)) {
      return;
    }

    try {
      console.log("[NATS] Inscrevendo em subject:", subject);
      const subscription = this.connection.subscribe(subject) as Subscription;
      this.subscriptions.set(subject, subscription);
      console.log("[NATS] Inscrito em:", subject, "(subscriptions ativas:", this.subscriptions.size, ")");

      void (async () => {
        try {
          for await (const msg of subscription) {
            try {
              const raw = new TextDecoder().decode(msg.data);
              const data = JSON.parse(raw);
              console.log("[NATS] Mensagem recebida em", subject, ":", typeof data === "object" ? Object.keys(data).join(", ") : raw.slice(0, 200));
              const listeners = this.listeners.get(subject);
              if (listeners) {
                listeners.forEach((listener) => {
                  try {
                    listener(data);
                  } catch (error) {
                    console.error("Error in NATS listener:", error);
                  }
                });
              }
            } catch (error) {
              console.error("Error parsing NATS message:", error);
            }
          }
        } catch (error) {
          if (!this.connection?.isClosed()) {
            console.error(`Failed to read NATS subscription ${subject}:`, error);
          }
        } finally {
          if (this.subscriptions.get(subject) === subscription) {
            this.subscriptions.delete(subject);
          }
        }
      })();
    } catch (error) {
      console.error(`Failed to subscribe to ${subject}:`, error);
    }
  }

  private async restoreSubscriptions(): Promise<void> {
    for (const subject of this.listeners.keys()) {
      await this.ensureSubjectSubscription(subject);
    }
  }

  async connect(): Promise<void> {
    if (this.connection?.isClosed()) {
      this.connection = null;
      this.subscriptions.clear();
      this.setConnectionState("disconnected");
    }

    if (this.connection) {
      this.setConnectionState("connected");
      return;
    }

    if (this.connectInFlight) {
      return this.connectInFlight;
    }

    const url = this.getResolvedUrl();

    if (!this.config.enabled || !url) {
      this.setConnectionState("disconnected");
      return;
    }

    if (!this.isBrowserWsUrl(url)) {
      if (!this.warnedInvalidUrl) {
        this.warnedInvalidUrl = true;
        console.warn(
          "NATS desativado no browser: use VITE_NATS_URL com ws://, wss://, nats:// ou tls://.",
        );
      }
      this.setConnectionState("disconnected");
      return;
    }

    const client = await this.loadClient();
    if (!client) {
      this.setConnectionState("disconnected");
      return;
    }

    this.setConnectionState(
      this.reconnectAttempts > 0 ? "reconnecting" : "connecting",
    );

    this.connectInFlight = (async () => {
      try {
        this.manualDisconnect = false;
        const credentials = await this.getCredentials();
        const authenticator = client.credsAuthenticator(
          new TextEncoder().encode(buildCredsFile(credentials)),
        );

        this.connection = await client.wsconnect({
          servers: [url],
          authenticator,
        });
        this.reconnectAttempts = 0;
        this.clearReconnectTimer();
        this.watchConnection(this.connection);
        await this.restoreSubscriptions();
        this.setConnectionState("connected");
        console.info(
          "[realtime] NATS conectado em",
          url,
          this.subscriptions.size > 0
            ? `(restaurou ${this.subscriptions.size} subscriÃ§Ãµes)`
            : "",
        );
      } catch (error) {
        this.connection = null;
        this.subscriptions.clear();
        this.setConnectionState("disconnected");
        console.error("Failed to connect to NATS:", error);
        if (isNonRetryableNatsError(error)) {
          return;
        }
        this.scheduleReconnect();
      } finally {
        this.connectInFlight = null;

        if (this.pendingReconnect) {
          this.pendingReconnect = false;
          this.restartConnection();
        }
      }
    })();

    return this.connectInFlight;
  }

  private scheduleReconnect(): void {
    if (this.connectInFlight || this.reconnectTimer) {
      console.log("[NATS] Reconexão já agendada ou em voo, ignorando.");
      return;
    }

    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      this.setConnectionState("reconnecting");
      const delay =
        this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
      const cappedDelay = Math.min(delay, 30000);
      console.log("[NATS] Agendando reconexão", { tentativa: this.reconnectAttempts, max: this.maxReconnectAttempts, delay: cappedDelay });
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        console.log("[NATS] Executando reconexão (tentativa", this.reconnectAttempts, ")");
        void this.connect();
      }, cappedDelay);
      return;
    }

    console.log("[NATS] Máximo de tentativas de reconexão atingido (", this.maxReconnectAttempts, "). Desconectando.");
    this.setConnectionState("disconnected");
  }

  async subscribe(
    subject: string,
    callback: (event: DashboardEvent) => void,
  ): Promise<void> {
    if (!this.listeners.has(subject)) {
      this.listeners.set(subject, new Set());
    }
    this.listeners.get(subject)!.add(callback);
    console.log("[NATS] subscribe() chamado para:", subject, "(listeners:", this.listeners.get(subject)?.size, ")");

    if (!this.connection) {
      console.log("[NATS] Sem conexão ativa, conectando antes de subscrever...");
      await this.connect();
    }

    if (!this.connection) {
      console.warn("[NATS] Cannot subscribe: NATS not connected para subject:", subject);
      return;
    }

    if (!this.canSubscribeToSubject(subject)) {
      console.warn(
        "[NATS] Subject fora da allow-list do token, ignorando:",
        subject,
      );
      return;
    }

    await this.ensureSubjectSubscription(subject);
  }

  unsubscribe(
    subject: string,
    callback: (event: DashboardEvent) => void,
  ): void {
    const listeners = this.listeners.get(subject);
    if (listeners) {
      listeners.delete(callback);
      console.log("[NATS] unsubscribe() chamado para:", subject, "(listeners restantes:", listeners.size, ")");
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
      }
    }
  }

  async publish(subject: string, data: Record<string, unknown>): Promise<void> {
    if (!this.connection) {
      await this.connect();
    }

    if (!this.connection) {
      throw new Error("NATS not connected");
    }

    this.connection.publish(subject, new TextEncoder().encode(JSON.stringify(data)));
  }

  async disconnect(): Promise<void> {
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

    this.credentials = null;
    this.manualDisconnect = false;
    this.setConnectionState("disconnected");
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
      return false;
    }

    return allowSubjects.some((pattern) =>
      natsSubjectMatches(pattern, normalizedSubject),
    );
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
  return natsService || new NatsService({ url: "", enabled: false });
}

export function resetNatsService(): void {
  natsService = null;
}
