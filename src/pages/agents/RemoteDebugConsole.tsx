import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  agentsApi,
  type RemoteDebugLogEvent,
  type RemoteDebugLogLevel,
  type StartRemoteDebugSessionRequest,
} from "@/api";
import { getNatsService, resetNatsService, type DashboardEvent, type NatsCredentialsResponse } from "@/api/nats";
import { realtimeConfig } from "@/config/realtime";
import { useAuth } from "@/auth/AuthContext";
import { Badge, Button, ErrorDisplay } from "@/components/ui";

const MAX_LOG_LINES = 2000;

const LEVELS: RemoteDebugLogLevel[] = ["trace", "debug", "info", "warn", "error"];

const LEVEL_LABELS: Record<RemoteDebugLogLevel, string> = {
  trace: "TRACE",
  debug: "DEBUG",
  info: "INFO",
  warn: "WARN",
  error: "ERROR",
};

function formatTimestamp(ts: string | undefined): string {
  if (!ts) return "--:--:--";
  const value = new Date(ts);
  if (Number.isNaN(value.getTime())) return "--:--:--";
  return value.toLocaleTimeString("pt-BR", {
    hour12: false,
    fractionalSecondDigits: 3,
  });
}

function levelBadgeColor(level: RemoteDebugLogLevel): "slate" | "primary" | "warning" | "danger" {
  if (level === "info") return "primary";
  if (level === "warn") return "warning";
  if (level === "error") return "danger";
  return "slate";
}

function normalizeLevel(value: string | undefined): RemoteDebugLogLevel {
  const level = (value ?? "info").toLowerCase();
  if (level === "trace" || level === "debug" || level === "info" || level === "warn" || level === "error") {
    return level;
  }
  return "info";
}

function withSystemMessage(message: string): RemoteDebugLogEvent {
  return {
    sessionId: "system",
    agentId: "system",
    level: "info",
    message,
    timestampUtc: new Date().toISOString(),
    transport: "nats",
  };
}

function safeStringify(value: unknown): string {
  try {
    const json = JSON.stringify(value);
    return typeof json === "string" ? json : String(value);
  } catch {
    return String(value);
  }
}

function detectLogEvent(data: Record<string, unknown>): RemoteDebugLogEvent | null {
  const rawLevel = data.level;
  const level = typeof rawLevel === "string" ? normalizeLevel(rawLevel) : "info";
  const message =
    typeof data.message === "string"
      ? data.message
      : safeStringify(data);

  return {
    sessionId: typeof data.sessionId === "string" ? data.sessionId : "unknown",
    agentId: typeof data.agentId === "string" ? data.agentId : "unknown",
    level,
    message,
    timestampUtc: typeof data.timestampUtc === "string" ? data.timestampUtc : new Date().toISOString(),
    sequence: typeof data.sequence === "number" ? data.sequence : undefined,
    transport: "nats",
  };
}

export default function RemoteDebugConsole() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { session } = useAuth();

  const sessionId = searchParams.get("sessionId") ?? "";
  const agentId = searchParams.get("agentId") ?? "";
  const subject = searchParams.get("subject") ?? "";
  const expiresAt = searchParams.get("expiresAt") ?? "";
  const natsUrl = searchParams.get("natsUrl") ?? realtimeConfig.natsUrl;
  const jwtParam = searchParams.get("jwt");
  const nkeySeedParam = searchParams.get("nkeySeed");

  const [connectionState, setConnectionState] = useState<"connecting" | "connected" | "reconnecting" | "closed">("closed");
  const [debugState, setDebugState] = useState<"idle" | "running" | "stopped">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [logs, setLogs] = useState<RemoteDebugLogEvent[]>([]);
  const [lastSequence, setLastSequence] = useState<number | null>(null);
  const [isRestarting, setIsRestarting] = useState(false);
  const [currentLevel, setCurrentLevel] = useState<RemoteDebugLogLevel>("debug");
  const [levelFilters, setLevelFilters] = useState<Record<RemoteDebugLogLevel, boolean>>({
    trace: true,
    debug: true,
    info: true,
    warn: true,
    error: true,
  });

  const consoleRef = useRef<HTMLDivElement | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const cleanupRef = useRef<(() => void) | null>(null);

  const filteredLogs = useMemo(
    () => logs.filter((entry) => levelFilters[normalizeLevel(entry.level)]),
    [levelFilters, logs],
  );

  useEffect(() => {
    if (!autoScroll || !consoleRef.current) return;
    consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
  }, [filteredLogs, autoScroll]);

  const buildCredentials = useCallback((): NatsCredentialsResponse | null => {
    if (!jwtParam || !nkeySeedParam) return null;
    return {
      jwt: jwtParam,
      nkeySeed: nkeySeedParam,
      publicKey: "",
      expiresAtUtc: expiresAt || new Date(Date.now() + 7200000).toISOString(),
      publishSubjects: [],
      subscribeSubjects: [subject],
    };
  }, [jwtParam, nkeySeedParam, expiresAt, subject]);

  const connect = useCallback(async () => {
    if (!sessionId || !agentId) {
      setErrorMessage("Parâmetros inválidos para a sessão de remote debug.");
      setConnectionState("closed");
      return;
    }

    if (!session.accessToken) {
      setErrorMessage("Sessão autenticada não encontrada para conectar no NATS.");
      setConnectionState("closed");
      return;
    }

    if (!subject) {
      setErrorMessage("Sessão sem subject NATS para consumir logs de remote debug.");
      setConnectionState("closed");
      return;
    }

    if (!natsUrl) {
      setErrorMessage("URL NATS não informada para o console de remote debug.");
      setConnectionState("closed");
      return;
    }

    let disposed = false;
    setConnectionState("connecting");
    setErrorMessage(null);

    resetNatsService();
    const natsService = getNatsService({
      url: natsUrl,
      enabled: true,
      authMode: realtimeConfig.natsAuthMode,
      scopeMode: "preserve",
    });

    const creds = buildCredentials();
    if (creds) {
      natsService.setPreSuppliedCredentials(creds);
    }

    const appendLog = (event: RemoteDebugLogEvent) => {
      setLogs((previous) => {
        const next = [...previous, event];
        if (next.length <= MAX_LOG_LINES) return next;
        return next.slice(next.length - MAX_LOG_LINES);
      });
      if (typeof event.sequence === "number") {
        setLastSequence((current) => {
          if (typeof current !== "number") return event.sequence ?? null;
          return Math.max(current, event.sequence ?? 0);
        });
      }
    };

    const unsubscribeConnectionState = natsService.onConnectionStateChange((state) => {
      if (disposed) return;
      if (state === "connected") {
        setConnectionState("connected");
        setErrorMessage(null);
        return;
      }
      if (state === "reconnecting") {
        setConnectionState("reconnecting");
        return;
      }
      if (state === "connecting") {
        setConnectionState("connecting");
        return;
      }
      if (state === "auth_error") {
        setConnectionState("closed");
        const diagnostics = natsService.getConnectionDiagnostics();
        setErrorMessage(
          diagnostics.lastErrorMessage ??
            "Falha de autenticação no NATS para o console de remote debug.",
        );
        return;
      }
      setConnectionState("closed");
    });

    const onRemoteDebugEvent = (message: DashboardEvent | Record<string, unknown>) => {
      if (disposed) return;
      const data = "data" in message && message.data ? message.data : message;
      const log = detectLogEvent(data as Record<string, unknown>);
      if (log) {
        appendLog(log);
      }
    };

    const connected = await natsService.connect();
    if (disposed) return;

    if (!connected) {
      const diagnostics = natsService.getConnectionDiagnostics();
      setConnectionState("closed");
      setErrorMessage(
        diagnostics.lastErrorMessage ??
          "Falha ao conectar no remote debug via NATS.",
      );
      return;
    }

    const subscribed = await natsService.subscribe(subject, onRemoteDebugEvent, {
      connectIfNeeded: false,
    });
    if (disposed) return;

    if (!subscribed) {
      setConnectionState("closed");
      setErrorMessage(
        "Conexão NATS estabelecida, mas não foi possível assinar o subject do remote debug. " +
        "O servidor NATS pode não autorizar este subject para as credenciais fornecidas.",
      );
      return;
    }

    setErrorMessage(null);
    setConnectionState("connected");
    appendLog(withSystemMessage(`Escutando subject NATS: ${subject}`));

    cleanupRef.current = () => {
      disposed = true;
      unsubscribeConnectionState();
      natsService.unsubscribe(subject, onRemoteDebugEvent);
    };
  }, [agentId, buildCredentials, natsUrl, session.accessToken, sessionId, subject]);

  // Conecta NATS sempre que debugState transita para "running"
  useEffect(() => {
    if (debugState !== "running") return;
    connect();
    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debugState]);

  useEffect(() => {
    if (!expiresAt) return;
    const expiresAtTs = new Date(expiresAt).getTime();
    if (Number.isNaN(expiresAtTs)) return;

    const remainingMs = expiresAtTs - Date.now();
    if (remainingMs <= 0) {
      setLogs((current) => [
        ...current,
        withSystemMessage("Sessão expirada (TTL atingido)."),
      ]);
      return;
    }

    const timerId = window.setTimeout(() => {
      setLogs((current) => [
        ...current,
        withSystemMessage("Sessão expirada (TTL atingido)."),
      ]);
    }, remainingMs);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [expiresAt]);

  const handleStartDebug = () => {
    setDebugState("running");
  };

  const handleStopDebug = () => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    setConnectionState("closed");
    setDebugState("stopped");
    setLogs((current) => [
      ...current,
      withSystemMessage("Debug pausado pelo usuário."),
    ]);
  };

  const handleStopSession = async () => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    try {
      await agentsApi.stopRemoteDebugSession(agentId, sessionId);
    } catch {
      // Silencia erro no stop — já estamos encerrando.
    }
    setConnectionState("closed");
    setDebugState("idle");
    setLogs((current) => [
      ...current,
      withSystemMessage("Sessão encerrada pelo usuário."),
    ]);
  };

  const handleRestartWithLevel = async (level: RemoteDebugLogLevel) => {
    if (isRestarting) return;
    setIsRestarting(true);

    cleanupRef.current?.();
    cleanupRef.current = null;

    try {
      await agentsApi.stopRemoteDebugSession(agentId, sessionId);
    } catch {
      // Ignora falha no stop da sessão antiga.
    }

    setLogs([]);
    setLastSequence(null);
    setCurrentLevel(level);

    try {
      const payload: StartRemoteDebugSessionRequest = {
        logLevel: level,
        preferredTransport: "nats",
        ttlMinutes: 20,
      };
      const newSession = await agentsApi.startRemoteDebugSession(agentId, payload);
      const newSubject = newSession.natsTenantSubject;
      if (!newSubject) {
        throw new Error("Nova sessão criada sem subject NATS.");
      }

      updateQueryParams({
        sessionId: newSession.sessionId,
        subject: newSubject,
        expiresAt: newSession.expiresAtUtc,
        natsUrl: newSession.natsWssUrl ?? natsUrl,
      });

      let jwt: string | undefined;
      let nkeySeed: string | undefined;
      try {
        const creds = await agentsApi.getRemoteDebugNatsCredentials(agentId, newSession.sessionId);
        jwt = creds.jwt;
        nkeySeed = creds.nkeySeed;
      } catch {
        // Endpoint pode não existir — prossegue sem JWT.
      }

      if (jwt && nkeySeed) {
        updateQueryParams({ jwt, nkeySeed });
      }

      setLogs([withSystemMessage(`Sessão reiniciada com nível: ${LEVEL_LABELS[level]}`)]);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Falha ao reiniciar sessão.";
      setErrorMessage(msg);
      setLogs((current) => [...current, withSystemMessage(`Erro: ${msg}`)]);
    } finally {
      setIsRestarting(false);
    }
  };

  const updateQueryParams = (params: Record<string, string>) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(params)) {
      next.set(key, value);
    }
    setSearchParams(next, { replace: true });
  };

  const [messageFilter, setMessageFilter] = useState("");
  const displayLogs = useMemo(() => {
    const query = messageFilter.trim().toLowerCase();
    return filteredLogs.filter((entry) => {
      if (!query) return true;
      return entry.message.toLowerCase().includes(query);
    });
  }, [filteredLogs, messageFilter]);

  const handleScroll = () => {
    const element = consoleRef.current;
    if (!element) return;
    const nearBottom =
      element.scrollTop + element.clientHeight >= element.scrollHeight - 20;
    setAutoScroll(nearBottom);
  };

  if (!sessionId || !agentId) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <ErrorDisplay message="Parâmetros inválidos para a tela de remote debug." />
      </div>
    );
  }

  const totalLines = logs.length;
  const expiresLabel = expiresAt
    ? new Date(expiresAt).toLocaleTimeString("pt-BR", { hour12: false })
    : "--:--";

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* Toolbar */}
      <header className="flex items-center gap-2 border-b border-border bg-surface/80 px-3 py-2 text-xs">
        <Badge
          color={
            debugState === "running" && connectionState === "connected"
              ? "success"
              : debugState === "running" && connectionState === "reconnecting"
                ? "warning"
                : debugState === "running" && connectionState === "connecting"
                  ? "warning"
                  : debugState === "stopped"
                    ? "warning"
                    : "slate"
          }
        >
          {debugState === "running" && connectionState === "connected"
            ? "CONECTADO"
            : debugState === "running" && connectionState === "reconnecting"
              ? "RECONECTANDO"
              : debugState === "running" && connectionState === "connecting"
                ? "CONECTANDO"
                : debugState === "stopped"
                  ? "PAUSADO"
                  : "PRONTO"}
        </Badge>

        <span className="ml-1 text-muted">{agentId.slice(0, 8)}</span>
        <span className="text-muted">·</span>
        <span className="text-muted">{totalLines} linhas</span>
        <span className="text-muted">·</span>
        <span className="text-muted">exp: {expiresLabel}</span>

        <div className="ml-auto flex items-center gap-2">
          {debugState === "running" && (
            <>
              {/* Filtro de nível (display only) */}
              <span className="text-muted">filtro:</span>
              {LEVELS.map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() =>
                    setLevelFilters((current) => ({
                      ...current,
                      [level]: !current[level],
                    }))
                  }
                  className={`rounded px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider transition-colors ${
                    levelFilters[level]
                      ? "bg-primary/20 text-primary"
                      : "text-muted hover:text-muted-foreground"
                  }`}
                >
                  {level}
                </button>
              ))}

              <span className="mx-1 h-4 w-px bg-surface-hover" />

              {/* Nível da sessão (restart) */}
              <span className="text-muted">nível:</span>
              <select
                value={currentLevel}
                onChange={(e) => handleRestartWithLevel(e.target.value as RemoteDebugLogLevel)}
                disabled={isRestarting}
                className="h-6 rounded border border-border bg-surface-light px-2 text-[10px] font-mono uppercase text-foreground outline-none focus:border-primary disabled:opacity-50"
              >
                {LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {LEVEL_LABELS[level]}
                  </option>
                ))}
              </select>

              <span className="mx-1 h-4 w-px bg-surface-hover" />

              <Button
                size="sm"
                variant="ghost"
                onClick={() => setLogs([])}
                disabled={totalLines === 0}
                className="text-[10px]"
              >
                limpar
              </Button>

              <span className="mx-1 h-4 w-px bg-surface-hover" />
            </>
          )}

          {(debugState === "idle" || debugState === "stopped") && (
            <Button
              size="sm"
              variant="secondary"
              onClick={handleStartDebug}
              className="text-[10px]"
            >
              iniciar debug
            </Button>
          )}

          {debugState === "running" && (
            <Button
              size="sm"
              variant="secondary"
              onClick={handleStopDebug}
              className="text-[10px]"
            >
              parar debug
            </Button>
          )}

          <Button
            size="sm"
            variant="secondary"
            onClick={handleStopSession}
            className="text-[10px]"
          >
            encerrar
          </Button>
        </div>
      </header>

      {/* Search bar */}
      {(debugState === "running" || debugState === "stopped") && (
      <div className="flex items-center gap-2 border-b border-border bg-surface/40 px-3 py-1.5">
        <input
          value={messageFilter}
          onChange={(event) => setMessageFilter(event.target.value)}
          placeholder="Filtrar mensagens..."
          className="h-7 flex-1 rounded border border-border bg-background px-2 font-mono text-xs text-foreground outline-none focus:border-primary"
        />
        <span className="text-[10px] text-muted">
          seq: {lastSequence ?? "--"}
        </span>
        <span className="text-[10px] text-muted">
          scroll: {autoScroll ? "auto" : "manual"}
        </span>
      </div>
      )}

      {/* Log area */}
      <div
        ref={consoleRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-3 py-2 font-mono text-xs leading-relaxed"
      >
        {displayLogs.length === 0 && (
          <p className="py-12 text-center text-sm text-muted">
            {debugState === "idle"
              ? "Console pronto. Clique em \"iniciar debug\" para começar a receber logs."
              : debugState === "stopped"
                ? "Debug pausado. Clique em \"iniciar debug\" para retomar."
                : connectionState === "connected"
                  ? "Aguardando entradas de log..."
                  : "Nenhuma linha para exibir."}
          </p>
        )}

        {displayLogs.map((entry, index) => {
          const level = normalizeLevel(entry.level);
          return (
            <div
              key={`${entry.sessionId}-${entry.sequence ?? index}-${entry.timestampUtc}-${index}`}
              className="flex items-start gap-2 rounded px-1 py-0.5 hover:bg-surface-light"
            >
              <span className="shrink-0 text-muted">
                {formatTimestamp(entry.timestampUtc)}
              </span>
              <Badge color={levelBadgeColor(level)}>
                {level.toUpperCase().padEnd(5)}
              </Badge>
              <span className="break-all text-foreground">
                {entry.message}
              </span>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <footer className="border-t border-border bg-surface/60 px-3 py-1 text-[10px] text-muted">
        {debugState === "idle" ? (
          <span>Pronto para iniciar · subject: {subject}</span>
        ) : debugState === "stopped" ? (
          <span>Debug pausado · {totalLines} linhas retidas</span>
        ) : connectionState === "connected" ? (
          <span>Recebendo logs via NATS · subject: {subject}</span>
        ) : connectionState === "closed" ? (
          <span>Conexão fechada</span>
        ) : (
          <span>{connectionState}...</span>
        )}
      </footer>

      {/* Error overlay */}
      {errorMessage && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/90 p-6">
          <div className="max-w-lg">
            <ErrorDisplay message={errorMessage} />
          </div>
        </div>
      )}
    </div>
  );
}
