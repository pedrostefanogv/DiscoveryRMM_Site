import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  agentsApi,
  type RemoteDebugLogEvent,
  type RemoteDebugLogLevel,
  type RemoteDebugSessionEndedEvent,
  type RemoteDebugSessionJoinedEvent,
} from "@/api";
import { getNatsService, type DashboardEvent } from "@/api/nats";
import { realtimeConfig } from "@/config/realtime";
import { useAuth } from "@/auth/AuthContext";
import { Badge, Button, Card, ErrorDisplay } from "@/components/ui";

const MAX_LOG_LINES = 2000;

const levelOrder: RemoteDebugLogLevel[] = ["debug", "info", "warn", "error"];

function formatTimestamp(ts: string | undefined): string {
  if (!ts) return "--:--:--";
  const value = new Date(ts);
  if (Number.isNaN(value.getTime())) return "--:--:--";
  return value.toLocaleTimeString("pt-BR", {
    hour12: false,
    fractionalSecondDigits: 3,
  });
}

function levelBadgeColor(
  level: RemoteDebugLogLevel,
): "slate" | "primary" | "warning" | "danger" {
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
    transport: "nats",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readOptionalString(
  source: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = source[key];
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function readOptionalNumber(
  source: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = source[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function safeStringify(value: unknown): string {
  try {
    const json = JSON.stringify(value);
    return typeof json === "string" ? json : String(value);
  } catch {
    return String(value);
  }
}

function unwrapEnvelope(
  message: DashboardEvent | Record<string, unknown>,
): { envelope: Record<string, unknown>; payload: Record<string, unknown> } {
  const envelope = isRecord(message) ? message : {};
  const payload = isRecord(envelope.data) ? envelope.data : envelope;
  return { envelope, payload };
}

function detectEventKind(
  envelope: Record<string, unknown>,
  payload: Record<string, unknown>,
): "joined" | "log" | "ended" | null {
  const rawType =
    readOptionalString(envelope, "eventType") ??
    readOptionalString(payload, "eventType");

  if (rawType) {
    const normalized = rawType.toLowerCase();
    if (normalized.includes("joined")) return "joined";
    if (normalized.includes("ended")) return "ended";
    if (normalized.includes("log")) return "log";
  }

  if ("level" in payload || "message" in payload) return "log";
  if ("endedAtUtc" in payload || "reason" in payload) return "ended";
  if ("startedAtUtc" in payload || "expiresAtUtc" in payload) return "joined";
  return null;
}

function toJoinedEvent(
  payload: Record<string, unknown>,
  fallback: {
    sessionId: string;
    agentId: string;
    expiresAt: string;
  },
): RemoteDebugSessionJoinedEvent {
  return {
    sessionId: readOptionalString(payload, "sessionId") ?? fallback.sessionId,
    agentId: readOptionalString(payload, "agentId") ?? fallback.agentId,
    startedAtUtc:
      readOptionalString(payload, "startedAtUtc") ?? new Date().toISOString(),
    expiresAtUtc: readOptionalString(payload, "expiresAtUtc") ?? fallback.expiresAt,
    preferredTransport: "nats",
  };
}

function toLogEvent(
  payload: Record<string, unknown>,
  envelope: Record<string, unknown>,
  fallback: {
    sessionId: string;
    agentId: string;
  },
): RemoteDebugLogEvent {
  const message =
    readOptionalString(payload, "message") ??
    readOptionalString(envelope, "message") ??
    safeStringify(payload);

  return {
    sessionId: readOptionalString(payload, "sessionId") ?? fallback.sessionId,
    agentId: readOptionalString(payload, "agentId") ?? fallback.agentId,
    level: normalizeLevel(
      readOptionalString(payload, "level") ?? readOptionalString(envelope, "level"),
    ),
    message,
    timestampUtc:
      readOptionalString(payload, "timestampUtc") ??
      readOptionalString(envelope, "timestampUtc") ??
      new Date().toISOString(),
    sequence:
      readOptionalNumber(payload, "sequence") ??
      readOptionalNumber(envelope, "sequence"),
    transport:
      readOptionalString(payload, "transport") ??
      readOptionalString(envelope, "transport") ??
      "nats",
  };
}

function toEndedEvent(
  payload: Record<string, unknown>,
  fallback: {
    sessionId: string;
  },
): RemoteDebugSessionEndedEvent {
  return {
    sessionId: readOptionalString(payload, "sessionId") ?? fallback.sessionId,
    endedAtUtc: readOptionalString(payload, "endedAtUtc") ?? new Date().toISOString(),
    reason: readOptionalString(payload, "reason") ?? null,
  };
}

export default function RemoteDebugConsole() {
  const [searchParams] = useSearchParams();
  const { session } = useAuth();

  const sessionId = searchParams.get("sessionId") ?? "";
  const agentId = searchParams.get("agentId") ?? "";
  const subject = searchParams.get("subject") ?? "";
  const expiresAt = searchParams.get("expiresAt") ?? "";
  const natsUrl = searchParams.get("natsUrl") ?? realtimeConfig.natsUrl;

  const [connectionState, setConnectionState] = useState<
    "connecting" | "connected" | "reconnecting" | "closed"
  >("connecting");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [logs, setLogs] = useState<RemoteDebugLogEvent[]>([]);
  const [lastSequence, setLastSequence] = useState<number | null>(null);
  const [lastTransport, setLastTransport] = useState<string>("nats");
  const [isStopping, setIsStopping] = useState(false);
  const [levelFilters, setLevelFilters] = useState<Record<RemoteDebugLogLevel, boolean>>({
    debug: true,
    info: true,
    warn: true,
    error: true,
  });

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
      setErrorMessage("Parametros invalidos para a sessao de remote debug.");
      setConnectionState("closed");
      return;
    }

    if (!session.accessToken) {
      setErrorMessage("Sessao autenticada nao encontrada para conectar no NATS.");
      setConnectionState("closed");
      return;
    }

    if (!subject) {
      setErrorMessage("Sessao sem subject NATS para consumir logs de remote debug.");
      setConnectionState("closed");
      return;
    }

    if (!natsUrl) {
      setErrorMessage("URL NATS nao informada para o console de remote debug.");
      setConnectionState("closed");
      return;
    }

    let disposed = false;
    setConnectionState("connecting");

    const natsService = getNatsService({
      url: natsUrl,
      enabled: true,
    });

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
      setConnectionState("closed");
    });

    const onRemoteDebugEvent = (message: DashboardEvent | Record<string, unknown>) => {
      if (disposed) return;
      const { envelope, payload } = unwrapEnvelope(message);
      const kind = detectEventKind(envelope, payload);

      if (kind === "joined") {
        const event = toJoinedEvent(payload, {
          sessionId,
          agentId,
          expiresAt: expiresAt || new Date().toISOString(),
        });

        setConnectionState("connected");
        appendLog(
          withSystemMessage(
            `Sessao conectada (${event.sessionId.slice(0, 8)}...) via nats.`,
          ),
        );
        return;
      }

      if (kind === "ended") {
        const event = toEndedEvent(payload, { sessionId });
        setConnectionState("closed");
        appendLog(
          withSystemMessage(
            `Sessao encerrada: ${event.reason?.trim() || "sem motivo informado"}.`,
          ),
        );
        return;
      }

      if (kind === "log") {
        const event = toLogEvent(payload, envelope, { sessionId, agentId });
        appendLog(event);
      }
    };

    void natsService
      .connect()
      .then(async () => {
        if (disposed) return;
        await natsService.subscribe(subject, onRemoteDebugEvent);
        if (disposed) return;
        setErrorMessage(null);
        setConnectionState("connected");
        appendLog(withSystemMessage(`Escutando subject NATS: ${subject}`));
      })
      .catch((error: unknown) => {
        if (disposed) return;
        const message =
          error instanceof Error
            ? error.message
            : "Falha ao conectar no remote debug via NATS.";
        setConnectionState("closed");
        setErrorMessage(message);
      });

    return () => {
      disposed = true;
      unsubscribeConnectionState();
      natsService.unsubscribe(subject, onRemoteDebugEvent);
    };
  }, [agentId, expiresAt, natsUrl, session.accessToken, sessionId, subject]);

  useEffect(() => {
    if (!expiresAt) return;
    const expiresAtTs = new Date(expiresAt).getTime();
    if (Number.isNaN(expiresAtTs)) return;

    const remainingMs = expiresAtTs - Date.now();
    if (remainingMs <= 0) {
      setLogs((current) => [
        ...current,
        withSystemMessage("Sessao expirada (TTL atingido)."),
      ]);
      return;
    }

    const timerId = window.setTimeout(() => {
      setLogs((current) => [
        ...current,
        withSystemMessage("Sessao expirada (TTL atingido)."),
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
      setLogs((current) => [
        ...current,
        withSystemMessage("Sessao encerrada pelo usuario."),
      ]);
    } catch (error) {
      const fallbackMessage =
        error instanceof Error ? error.message : "Falha ao encerrar a sessao.";
      setErrorMessage(fallbackMessage);
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
    const nearBottom =
      element.scrollTop + element.clientHeight >= element.scrollHeight - 20;
    setAutoScroll(nearBottom);
  };

  if (!sessionId || !agentId) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <ErrorDisplay message="Parametros invalidos para a tela de remote debug." />
      </div>
    );
  }

  const totalLines = logs.length;
  const expiresLabel = expiresAt
    ? new Date(expiresAt).toLocaleTimeString("pt-BR", { hour12: false })
    : "--:--";

  return (
    <div className="min-h-screen bg-slate-950 p-4 text-slate-100">
      <div className="mx-auto flex max-w-7xl flex-col gap-4">
        <Card className="border border-white/10 bg-slate-900/80">
          <div className="flex flex-wrap items-center gap-2 border-b border-white/5 px-4 py-3">
            <Badge
              color={
                connectionState === "connected"
                  ? "success"
                  : connectionState === "reconnecting"
                    ? "warning"
                    : "slate"
              }
            >
              {connectionState}
            </Badge>
            <span className="text-sm text-slate-300">Agente: {agentId}</span>
            <span className="text-xs text-slate-500">Sessao: {sessionId.slice(0, 8)}...</span>
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
                Encerrar sessao
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

        {errorMessage && <ErrorDisplay message={errorMessage} />}
      </div>
    </div>
  );
}
