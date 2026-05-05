import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import * as signalR from "@microsoft/signalr";
import {
  agentsApi,
  type RemoteDebugLogEvent,
  type RemoteDebugLogLevel,
  type RemoteDebugSessionEndedEvent,
  type RemoteDebugSessionJoinedEvent,
} from "@/api";
import { API_BASE_URL } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";
import { Badge, Button, Card, ErrorDisplay } from "@/components/ui";

const MAX_LOG_LINES = 2000;

const levelOrder: RemoteDebugLogLevel[] = ["debug", "info", "warn", "error"];

function resolveHubUrl(hubPath: string): string {
  if (hubPath.startsWith("http://") || hubPath.startsWith("https://")) {
    return hubPath;
  }
  return `${API_BASE_URL}${hubPath}`;
}

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
  if (level === "debug" || level === "info" || level === "warn" || level === "error") {
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
  };
}

export default function RemoteDebugConsole() {
  const [searchParams] = useSearchParams();
  const { session, refreshSession } = useAuth();

  const sessionId = searchParams.get("sessionId") ?? "";
  const agentId = searchParams.get("agentId") ?? "";
  const hubUrl = searchParams.get("hubUrl") ?? "/hubs/remote-debug";
  const expiresAt = searchParams.get("expiresAt") ?? "";

  const [connectionState, setConnectionState] = useState<
    "connecting" | "connected" | "reconnecting" | "closed"
  >("connecting");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [logs, setLogs] = useState<RemoteDebugLogEvent[]>([]);
  const [lastSequence, setLastSequence] = useState<number | null>(null);
  const [lastTransport, setLastTransport] = useState<string>("--");
  const [isStopping, setIsStopping] = useState(false);
  const [levelFilters, setLevelFilters] = useState<Record<RemoteDebugLogLevel, boolean>>({
    debug: true,
    info: true,
    warn: true,
    error: true,
  });

  const connectionRef = useRef<signalR.HubConnection | null>(null);
  const consoleRef = useRef<HTMLDivElement | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const filteredLogs = useMemo(
    () => logs.filter((entry) => levelFilters[normalizeLevel(entry.level)]),
    [levelFilters, logs],
  );

  useEffect(() => {
    if (!autoScroll || !consoleRef.current) return;
    consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
  }, [filteredLogs, autoScroll]);

  useEffect(() => {
    if (!sessionId || !agentId) {
      setErrorMessage("Parâmetros inválidos para a sessão de remote debug.");
      setConnectionState("closed");
      return;
    }

    if (!session.accessToken) {
      setErrorMessage("Sessão autenticada não encontrada para conectar no hub.");
      setConnectionState("closed");
      return;
    }

    let disposed = false;
    const resolvedHubUrl = resolveHubUrl(hubUrl);
    console.log("[RemoteDebug] Iniciando conexão SignalR em", resolvedHubUrl, { sessionId, agentId });
    const connection = new signalR.HubConnectionBuilder()
      .withUrl(resolvedHubUrl, {
        accessTokenFactory: async () => {
          if (session.accessToken) return session.accessToken;
          const refreshed = await refreshSession();
          return refreshed ?? "";
        },
      })
      .withAutomaticReconnect([1000, 2000, 5000, 10000])
      .withKeepAliveInterval(15_000)
      .withServerTimeout(60_000)
      .configureLogging(signalR.LogLevel.Warning)
      .build();

    console.log("[RemoteDebug] Conexão configurada:", {
      hubUrl: resolvedHubUrl,
      sessionId,
      agentId,
      reconnectDelays: [1000, 2000, 5000, 10000],
    });

    connectionRef.current = connection;

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
      if (event.transport) {
        setLastTransport(event.transport);
      }
    };

    const onJoined = (event: RemoteDebugSessionJoinedEvent) => {
      if (disposed) return;
      console.log("[RemoteDebug][SessionJoined]", {
        sessionId: event.sessionId,
        agentId: event.agentId,
        transport: event.preferredTransport,
        startedAt: event.startedAtUtc,
        expiresAt: event.expiresAtUtc,
      });
      setConnectionState("connected");
      appendLog(
        withSystemMessage(
          `Sessão conectada (${event.sessionId.slice(0, 8)}...) via ${event.preferredTransport}.`,
        ),
      );
    };

    const onLog = (event: RemoteDebugLogEvent) => {
      if (disposed) return;
      console.log("[RemoteDebug][Log]", {
        level: event.level,
        message: event.message?.slice(0, 200),
        sequence: event.sequence,
        timestamp: event.timestampUtc,
        transport: event.transport,
      });
      appendLog({ ...event, level: normalizeLevel(event.level) });
    };

    const onEnded = (event: RemoteDebugSessionEndedEvent) => {
      if (disposed) return;
      console.log("[RemoteDebug][SessionEnded]", {
        sessionId: event.sessionId,
        reason: event.reason,
        endedAt: event.endedAtUtc,
      });
      setConnectionState("closed");
      appendLog(
        withSystemMessage(
          `Sessão encerrada: ${event.reason?.trim() || "sem motivo informado"}.`,
        ),
      );
    };

    connection.on("RemoteDebugSessionJoined", onJoined);
    connection.on("RemoteDebugLog", onLog);
    connection.on("RemoteDebugSessionEnded", onEnded);
    console.log("[RemoteDebug] Handlers registrados:", [
      "RemoteDebugSessionJoined",
      "RemoteDebugLog",
      "RemoteDebugSessionEnded",
    ]);

    connection.onreconnecting(() => {
      if (disposed) return;
      console.log("[RemoteDebug] Reconectando...");
      setConnectionState("reconnecting");
      setErrorMessage(null);
    });

    connection.onreconnected(async () => {
      if (disposed) return;
      console.log("[RemoteDebug] Reconectado. Re-ingressando na sessão...");
      setConnectionState("connected");
      setErrorMessage(null);
      try {
        await connection.invoke("JoinSession", sessionId);
        console.log("[RemoteDebug] Sessão re-ingressada após reconexão.");
      } catch {
        console.warn("[RemoteDebug] Falha ao re-ingressar na sessão após reconexão.");
        setErrorMessage("Reconectado, mas não foi possível entrar novamente na sessão.");
      }
    });

    connection.onclose(() => {
      if (disposed) return;
      console.log("[RemoteDebug] Conexão fechada.");
      setConnectionState("closed");
    });

    const startPromise = connection
      .start()
      .then(async () => {
        if (disposed) return;
        console.log("[RemoteDebug] SignalR conectado (connectionId:", connection.connectionId, ")");
        console.log("[RemoteDebug] Ingressando na sessão:", sessionId);
        await connection.invoke("JoinSession", sessionId);
        console.log("[RemoteDebug] Sessão ingressada com sucesso.");
        setConnectionState("connected");
        setErrorMessage(null);
      })
      .catch((error: unknown) => {
        if (disposed) return;
        const message = error instanceof Error ? error.message : "Falha ao conectar no remote debug.";
        console.error("[RemoteDebug] Falha ao conectar:", message, error);
        setConnectionState("closed");
        setErrorMessage(message);
      });

    return () => {
      disposed = true;
      console.log("[RemoteDebug] Cleanup: removendo handlers e saindo da sessão.");
      connection.off("RemoteDebugSessionJoined", onJoined);
      connection.off("RemoteDebugLog", onLog);
      connection.off("RemoteDebugSessionEnded", onEnded);

      void startPromise.finally(async () => {
        try {
          if (connection.state === signalR.HubConnectionState.Connected) {
            console.log("[RemoteDebug] Saindo da sessão:", sessionId);
            await connection.invoke("LeaveSession", sessionId);
          }
        } catch {
          // Ignore cleanup invoke errors.
        } finally {
          if (connection.state !== signalR.HubConnectionState.Disconnected) {
            console.log("[RemoteDebug] Parando conexão (estado:", connection.state, ")");
            await connection.stop();
            console.log("[RemoteDebug] Conexão parada.");
          }
        }
      });
    };
  }, [agentId, hubUrl, refreshSession, session.accessToken, sessionId]);

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

  const handleStopSession = async () => {
    if (isStopping) return;
    setIsStopping(true);
    try {
      await agentsApi.stopRemoteDebugSession(agentId, sessionId);
      setConnectionState("closed");
      setLogs((current) => [...current, withSystemMessage("Sessão encerrada pelo usuário.")]);
    } catch (error) {
      const fallbackMessage = error instanceof Error ? error.message : "Falha ao encerrar a sessão.";
      setErrorMessage(fallbackMessage);
      try {
        if (connectionRef.current?.state === signalR.HubConnectionState.Connected) {
          await connectionRef.current.invoke("CloseSession", sessionId, "closed-by-user");
        }
      } catch {
        // Keep original stop error.
      }
    } finally {
      setIsStopping(false);
    }
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
    const nearBottom = element.scrollTop + element.clientHeight >= element.scrollHeight - 20;
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
  const expiresLabel = expiresAt ? new Date(expiresAt).toLocaleTimeString("pt-BR", { hour12: false }) : "--:--";

  return (
    <div className="min-h-screen bg-slate-950 p-4 text-slate-100">
      <div className="mx-auto flex max-w-7xl flex-col gap-4">
        <Card className="border border-white/10 bg-slate-900/80">
          <div className="flex flex-wrap items-center gap-2 border-b border-white/5 px-4 py-3">
            <Badge color={connectionState === "connected" ? "success" : connectionState === "reconnecting" ? "warning" : "slate"}>
              {connectionState}
            </Badge>
            <span className="text-sm text-slate-300">Agente: {agentId}</span>
            <span className="text-xs text-slate-500">Sessão: {sessionId.slice(0, 8)}...</span>
            <span className="text-xs text-slate-500">Expira: {expiresLabel}</span>
            <div className="ml-auto flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setLogs([])}
                disabled={totalLines === 0}
              >
                Limpar
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={handleStopSession}
                loading={isStopping}
                disabled={connectionState === "closed"}
              >
                Encerrar sessão
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-b border-white/5 px-4 py-3">
            <input
              value={messageFilter}
              onChange={(event) => setMessageFilter(event.target.value)}
              placeholder="Filtrar mensagens"
              className="h-9 min-w-[220px] rounded-md border border-white/10 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-primary"
            />
            {levelOrder.map((level) => (
              <button
                key={level}
                type="button"
                onClick={() =>
                  setLevelFilters((current) => ({
                    ...current,
                    [level]: !current[level],
                  }))
                }
                className={`rounded-md border px-3 py-1 text-xs uppercase tracking-wide transition-colors ${
                  levelFilters[level]
                    ? "border-primary text-primary"
                    : "border-white/10 text-slate-400 hover:text-slate-200"
                }`}
              >
                {level}
              </button>
            ))}
          </div>

          <div
            ref={consoleRef}
            onScroll={handleScroll}
            className="max-h-[70vh] overflow-y-auto px-4 py-3"
          >
            {displayLogs.length === 0 && (
              <p className="py-8 text-center text-sm text-slate-500">Nenhuma linha para exibir.</p>
            )}

            <div className="space-y-1">
              {displayLogs.map((entry, index) => {
                const level = normalizeLevel(entry.level);
                return (
                  <div
                    key={`${entry.sessionId}-${entry.sequence ?? index}-${entry.timestampUtc}-${index}`}
                    className="flex items-start gap-2 rounded px-2 py-1 text-xs hover:bg-white/5"
                  >
                    <span className="font-mono text-slate-500">{formatTimestamp(entry.timestampUtc)}</span>
                    <Badge color={levelBadgeColor(level)}>{level.toUpperCase()}</Badge>
                    <pre className="m-0 flex-1 whitespace-pre-wrap break-all font-mono text-slate-200">
                      {entry.message}
                    </pre>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-white/5 px-4 py-2 text-xs text-slate-500">
            <span>{totalLines} linhas</span>
            <span>seq: {lastSequence ?? "--"}</span>
            <span>transport: {lastTransport}</span>
            <span>auto-scroll: {autoScroll ? "on" : "off"}</span>
          </div>
        </Card>

        {errorMessage && (
          <ErrorDisplay message={errorMessage} />
        )}
      </div>
    </div>
  );
}
