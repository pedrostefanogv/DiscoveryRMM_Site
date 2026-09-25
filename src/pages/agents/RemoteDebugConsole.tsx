import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  agentsApi,
  clientsApi,
  sitesApi,
  type RemoteDebugLogEvent,
  type RemoteDebugLogLevel,
} from "@/api";
import { getNatsService, resetNatsService, type DashboardEvent, type NatsCredentialsResponse } from "@/api/nats";
import {
  buildViewerControlEnvelope,
  decodeControlEnvelope,
} from "@/api/sessionLiveness";
import { useSessionLiveness } from "@/hooks/useSessionLiveness";
import { realtimeConfig } from "@/config/realtime";
import { useAuth } from "@/auth/AuthContext";
import { Badge, Button, ErrorDisplay } from "@/components/ui";
import { ThemeToggle } from "@/components/auth/ThemeToggle";

const MAX_LOG_LINES = 2000;
const WAITING_HINT_MS = 12_000;

const LEVELS: RemoteDebugLogLevel[] = ["trace", "debug", "info", "warn", "error"];

const LEVEL_LABELS: Record<RemoteDebugLogLevel, string> = {
  trace: "TRACE",
  debug: "DEBUG",
  info: "INFO",
  warn: "WARN",
  error: "ERROR",
};

// ── Identidade do alvo (cliente › site › agente) ──────────────────────────
//
// O console é aberto como popup com apenas ids na query string. Resolvemos os
// nomes no cliente (a partir do subject NATS + API) para o operador saber, sem
// ambiguidade, QUAL agente está sendo depurado — antes só aparecia
// "019faa6f", que não identifica nada.
interface DebugTarget {
  clientId: string | null;
  siteId: string | null;
  clientName: string | null;
  siteName: string | null;
  agentName: string | null;
}

function shortId(id: string | null | undefined): string {
  const value = (id ?? "").trim();
  if (!value) return "—";
  return value.length > 8 ? value.slice(0, 8) : value;
}

/**
 * Extrai clientId/siteId do subject canônico do remote debug:
 * `tenant.<clientId>.site.<siteId>.agent.<agentId>.remote-debug.log`
 * Permite mostrar a hierarquia imediatamente, antes da API responder.
 */
function parseSubjectIds(subject: string): { clientId?: string; siteId?: string; agentId?: string } {
  const parts = subject.split(".").filter(Boolean);
  const after = (key: string) => {
    const index = parts.indexOf(key);
    return index >= 0 ? parts[index + 1] : undefined;
  };
  return {
    clientId: parts[0] === "tenant" ? parts[1] : undefined,
    siteId: after("site"),
    agentId: after("agent"),
  };
}

/**
 * Deriva o subject único de controle a partir do subject de log quando a query
 * string não traz `controlSubject` (ex.: popup aberta por uma versão anterior).
 */
function deriveControlSubject(logSubject: string): string {
  const value = (logSubject ?? "").trim();
  if (value.endsWith(".remote-debug.log")) {
    return value.slice(0, -".log".length) + ".control";
  }
  return "";
}

function parsePositiveInt(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
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

function formatLogLine(entry: RemoteDebugLogEvent): string {
  const level = normalizeLevel(entry.level).toUpperCase().padEnd(5);
  return `${entry.timestampUtc}\t${level}\t${entry.message}`;
}

export default function RemoteDebugConsole() {
  const [searchParams] = useSearchParams();
  const { session } = useAuth();

  const sessionId = searchParams.get("sessionId") ?? "";
  const agentId = searchParams.get("agentId") ?? "";
  const subject = searchParams.get("subject") ?? "";
  const expiresAt = searchParams.get("expiresAt") ?? "";
  const natsUrl = searchParams.get("natsUrl") ?? realtimeConfig.natsUrl;
  const jwtParam = searchParams.get("jwt");
  const nkeySeedParam = searchParams.get("nkeySeed");
  // Subject único de controle (ping/pong/setLevel). Vem do launcher; se a
  // popup foi aberta sem ele, deriva do subject de log.
  const controlSubject =
    searchParams.get("controlSubject") || deriveControlSubject(subject);
  const pingIntervalSeconds = parsePositiveInt(searchParams.get("pingInterval"));
  const missedPingsBeforeClose = parsePositiveInt(searchParams.get("misses"));
  const initialGraceSeconds = parsePositiveInt(searchParams.get("grace"));
  const keepAliveSeconds = parsePositiveInt(searchParams.get("keepAlive"));

  // Auto-conecta: a sessão já foi criada no servidor antes de a popup abrir, e
  // o NATS não faz replay — cada segundo parado em "iniciar debug" era log
  // perdido para sempre.
  const [connectionState, setConnectionState] = useState<"connecting" | "connected" | "reconnecting" | "closed">("closed");
  const [debugState, setDebugState] = useState<"idle" | "running" | "stopped">("running");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [logs, setLogs] = useState<RemoteDebugLogEvent[]>([]);
  const [lastSequence, setLastSequence] = useState<number | null>(null);
  const [isRestarting, setIsRestarting] = useState(false);
  const [currentLevel, setCurrentLevel] = useState<RemoteDebugLogLevel>("debug");
  // expiresAt deixa de ser só a query string: o keepalive renova e o valor
  // precisa refletir o prazo atual no console.
  const [sessionExpiresAt, setSessionExpiresAt] = useState(expiresAt);
  const [maxExpiresAt, setMaxExpiresAt] = useState<string>("");
  const [expired, setExpired] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "ok" | "error">("idle");
  const [levelFilters, setLevelFilters] = useState<Record<RemoteDebugLogLevel, boolean>>({
    trace: true,
    debug: true,
    info: true,
    warn: true,
    error: true,
  });

  const [target, setTarget] = useState<DebugTarget | null>(null);
  const [targetLoading, setTargetLoading] = useState(false);

  const consoleRef = useRef<HTMLDivElement | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    setSessionExpiresAt(expiresAt);
  }, [expiresAt]);

  // Ids vindos do subject: disponíveis antes de qualquer chamada de API.
  const subjectIds = useMemo(() => parseSubjectIds(subject), [subject]);
  const resolvedAgentId = agentId || subjectIds.agentId || "";
  const clientId = target?.clientId ?? subjectIds.clientId ?? null;
  const siteId = target?.siteId ?? subjectIds.siteId ?? null;

  // Resolve nomes de cliente/site/agente (best-effort: sem permissão ou offline
  // a barra continua mostrando os ids curtos).
  useEffect(() => {
    if (!resolvedAgentId) {
      setTarget(null);
      return;
    }

    let cancelled = false;
    setTargetLoading(true);

    void (async () => {
      try {
        const agent = await agentsApi.get(resolvedAgentId);
        if (cancelled) return;

        const next: DebugTarget = {
          clientId: agent.clientId ?? null,
          siteId: agent.siteId ?? null,
          clientName: null,
          siteName: null,
          agentName: (agent.displayName ?? "").trim() || (agent.hostname ?? "").trim() || null,
        };

        if (agent.clientId) {
          const [client, site] = await Promise.all([
            clientsApi.get(agent.clientId).catch(() => null),
            agent.siteId ? sitesApi.get(agent.clientId, agent.siteId).catch(() => null) : Promise.resolve(null),
          ]);
          if (cancelled) return;
          next.clientName = client?.name?.trim() || null;
          next.siteName = site?.name?.trim() || null;
        }

        setTarget(next);
      } catch {
        // Sem acesso ao agente: mantém apenas os ids derivados do subject.
        if (!cancelled) {
          setTarget({ clientId: null, siteId: null, clientName: null, siteName: null, agentName: null });
        }
      } finally {
        if (!cancelled) setTargetLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [resolvedAgentId]);

  const levelCounts = useMemo(() => {
    const counts: Record<RemoteDebugLogLevel, number> = {
      trace: 0,
      debug: 0,
      info: 0,
      warn: 0,
      error: 0,
    };
    for (const entry of logs) {
      counts[normalizeLevel(entry.level)] += 1;
    }
    return counts;
  }, [logs]);

  const displayLogs = useMemo(
    () => logs.filter((entry) => levelFilters[normalizeLevel(entry.level)]),
    [levelFilters, logs],
  );

  const [messageFilter, setMessageFilter] = useState("");
  const visibleLogs = useMemo(() => {
    const query = messageFilter.trim().toLowerCase();
    if (!query) return displayLogs;
    return displayLogs.filter((entry) => entry.message.toLowerCase().includes(query));
  }, [displayLogs, messageFilter]);

  useEffect(() => {
    if (!autoScroll || !consoleRef.current) return;
    consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
  }, [visibleLogs, autoScroll]);

  const buildCredentials = useCallback((): NatsCredentialsResponse | null => {
    if (!jwtParam || !nkeySeedParam) return null;
    return {
      jwt: jwtParam,
      nkeySeed: nkeySeedParam,
      publicKey: "",
      expiresAtUtc: expiresAt || new Date(Date.now() + 7200000).toISOString(),
      // O canal de controle é assinado pelo viewer (pong/closed/levelChanged)
      // além dos logs. A allow-list local precisa cobrir os dois subjects.
      publishSubjects: [],
      subscribeSubjects: [subject, controlSubject].filter(Boolean),
    };
  }, [jwtParam, nkeySeedParam, expiresAt, subject, controlSubject]);

  // ── Canal de controle: liveness (ping-pong) + renovação contínua ──────────
  //
  // O núcleo useSessionLiveness é agnóstico ao debug: recebe aqui as funções
  // de sinal e keepalive. Ele pinga no subject único, detecta a ausência do
  // agente (grace inicial + 3 misses) e renova o TTL no servidor por HTTP.
  const sendControlPing = useCallback(
    (sequence: number) => {
      if (!sessionId || !controlSubject) return;
      const natsService = getNatsService();
      const envelope = buildViewerControlEnvelope("ping", sessionId, sequence);
      void natsService
        .publish(controlSubject, envelope as unknown as Record<string, unknown>)
        .catch(() => {
          // Falha ao publicar o ping é tolerada: o agente também envia o seu e
          // a ausência real é detectada pela falta de resposta.
        });
    },
    [sessionId, controlSubject],
  );

  const handleKeepAlive = useCallback(async () => {
    const result = await agentsApi.renewRemoteDebugSession(agentId, sessionId);
    return {
      expiresAtUtc: result.expiresAtUtc,
      maxExpiresAtUtc: result.maxExpiresAtUtc,
      sessionActive: result.sessionActive,
    };
  }, [agentId, sessionId]);

  const handlePeerLost = useCallback(() => {
    setConnectionState("closed");
    setErrorMessage(
      "O agente não respondeu ao canal de controle. Sessão encerrada automaticamente — reabra o debug para reconectar.",
    );
    setLogs((current) => [
      ...current,
      withSystemMessage("SEM AGENTE: sessão encerrada automaticamente pelo ping-pong."),
    ]);
    void agentsApi.stopRemoteDebugSession(agentId, sessionId).catch(() => {
      // best-effort: a sessão já está inutilizável
    });
  }, [agentId, sessionId]);

  const handleLivenessExpired = useCallback((reason: string) => {
    setExpired(true);
    setLogs((current) => [
      ...current,
      withSystemMessage("Sessão encerrada no teto de duração (" + reason + ")."),
    ]);
  }, []);

  const liveness = useSessionLiveness({
    enabled: debugState === "running",
    sessionId,
    connectionState,
    pingIntervalSeconds,
    missedPingsBeforeClose,
    initialGraceSeconds,
    keepAliveSeconds,
    sendPing: sendControlPing,
    keepAlive: handleKeepAlive,
    onPeerLost: handlePeerLost,
    onExpired: handleLivenessExpired,
    onKeepAlive: (result) => {
      setSessionExpiresAt(result.expiresAtUtc);
      if (result.maxExpiresAtUtc) setMaxExpiresAt(result.maxExpiresAtUtc);
    },
  });

  // Retorna a função de teardown (ou null quando nem chegou a conectar).
  // Devolver o disposer — em vez de só gravar em cleanupRef ao final — é o que
  // garante que um unmount/troca de sessão DURANTE o connect (antes do
  // subscribe resolver) não deixe assinatura órfã; no StrictMode do dev isso
  // duplicava as linhas no console.
  const connect = useCallback(async (): Promise<(() => void) | null> => {
    if (!sessionId || !agentId) {
      setErrorMessage("Parâmetros inválidos para a sessão de remote debug.");
      setConnectionState("closed");
      return null;
    }

    if (!session.accessToken) {
      setErrorMessage("Sessão autenticada não encontrada para conectar no NATS.");
      setConnectionState("closed");
      return null;
    }

    if (!subject) {
      setErrorMessage("Sessão sem subject NATS para consumir logs de remote debug.");
      setConnectionState("closed");
      return null;
    }

    if (!natsUrl) {
      setErrorMessage("URL NATS não informada para o console de remote debug.");
      setConnectionState("closed");
      return null;
    }

    let disposed = false;
    const disposers: Array<() => void> = [];
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      for (const fn of disposers) {
        try {
          fn();
        } catch {
          // teardown best-effort: nunca deve derrubar a UI
        }
      }
      disposers.length = 0;
    };

    setConnectionState("connecting");
    setErrorMessage(null);

    const creds = buildCredentials();

    resetNatsService();
    const natsService = getNatsService({
      url: natsUrl,
      enabled: true,
      // O console recebe credenciais JWT escopadas pelo backend
      // (POST .../nats-credentials). Usar o modo global do dashboard aqui faz a
      // conexão autenticar com o token da API e IGNORAR as credenciais, o que
      // quebra a assinatura do subject e/ou a allow-list do JWT. Sem credenciais
      // (endpoint indisponível) cai no modo global como fallback.
      authMode: creds ? "jwt_credentials" : realtimeConfig.natsAuthMode,
      scopeMode: "preserve",
    });

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
        // JWT NATS expirado no meio da sessão longa: em vez de auth_error
        // terminal (que travava o console até reconectar à mão), busca
        // credencial fresca e reconecta. O stream é retomado pelo
        // restoreSubscriptions do próprio serviço.
        setConnectionState("reconnecting");
        void (async () => {
          try {
            const fresh = await agentsApi.getRemoteDebugNatsCredentials(
              agentId,
              sessionId,
            );
            if (disposed) return;
            natsService.setPreSuppliedCredentials({
              jwt: fresh.jwt,
              nkeySeed: fresh.nkeySeed,
              publicKey: "",
              expiresAtUtc: fresh.expiresAtUtc,
              publishSubjects: [],
              subscribeSubjects: [subject, controlSubject].filter(Boolean),
            });
            const reconnected = await natsService.forceReconnect();
            if (disposed) return;
            if (!reconnected) {
              const diagnostics = natsService.getConnectionDiagnostics();
              setConnectionState("closed");
              setErrorMessage(
                diagnostics.lastErrorMessage ??
                  "Falha de autenticação no NATS para o console de remote debug.",
              );
            }
          } catch {
            if (!disposed) {
              setConnectionState("closed");
              setErrorMessage(
                "Falha ao renovar as credenciais NATS do console de remote debug.",
              );
            }
          }
        })();
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

    disposers.push(unsubscribeConnectionState);

    const connected = await natsService.connect();
    if (disposed) return dispose;

    if (!connected) {
      const diagnostics = natsService.getConnectionDiagnostics();
      setConnectionState("closed");
      setErrorMessage(
        diagnostics.lastErrorMessage ??
          "Falha ao conectar no remote debug via NATS.",
      );
      return dispose;
    }

    const subscribed = await natsService.subscribe(subject, onRemoteDebugEvent, {
      connectIfNeeded: false,
    });
    if (disposed) return dispose;

    if (!subscribed) {
      setConnectionState("closed");
      setErrorMessage(
        "Conexão NATS estabelecida, mas não foi possível assinar o subject do remote debug. " +
        "O servidor NATS pode não autorizar este subject para as credenciais fornecidas.",
      );
      return dispose;
    }

    // Canal de controle (ping/pong/setLevel). Frames de controle NÃO entram
    // na lista de logs: alimentam a liveness e os estados da toolbar.
    const onControlEvent = (message: DashboardEvent | Record<string, unknown>) => {
      if (disposed) return;
      const data = "data" in message && message.data ? message.data : message;
      const envelope = decodeControlEnvelope(data);
      if (!envelope || envelope.sessionId !== sessionId) return;
      if (envelope.from === "viewer") return; // eco no subject único

      liveness.notePeerSignal();

      if (envelope.type === "closed") {
        const reason =
          typeof envelope.payload?.reason === "string"
            ? envelope.payload.reason
            : "encerrada";
        setLogs((current) => [
          ...current,
          withSystemMessage(`Sessão encerrada pelo agente (${reason}).`),
        ]);
      }
    };

    let controlSubscribed = true;
    if (controlSubject) {
      controlSubscribed = await natsService.subscribe(
        controlSubject,
        onControlEvent,
        { connectIfNeeded: false },
      );
      if (disposed) return dispose;
      if (controlSubscribed) {
        disposers.push(() =>
          natsService.unsubscribe(controlSubject, onControlEvent),
        );
      }
    }

    setErrorMessage(null);
    setConnectionState("connected");
    appendLog(withSystemMessage(`Escutando subject NATS: ${subject}`));
    if (controlSubject) {
      appendLog(
        withSystemMessage(
          controlSubscribed
            ? `Canal de controle ativo: ${controlSubject}`
            : `Canal de controle indisponível (${controlSubject}); a sessão não renovará.`,
        ),
      );
    }

    disposers.push(() => natsService.unsubscribe(subject, onRemoteDebugEvent));
    return dispose;
  }, [
    agentId,
    buildCredentials,
    controlSubject,
    liveness,
    natsUrl,
    session.accessToken,
    sessionId,
    subject,
  ]);

  // Conecta sempre que o estado é "running" E reconecta quando a sessão muda
  // (troca de nível gera novo sessionId/subject). Sem sessionId/subject nas
  // dependências, "reiniciar com nível X" deixava a popup escutando o subject
  // ANTIGO — já encerrado no agente — e o console parecia "não receber logs".
  useEffect(() => {
    if (debugState !== "running") return;

    let cancelled = false;
    let dispose: (() => void) | null = null;

    void connect().then((cleanup) => {
      if (!cleanup) return;
      // O connect terminou DEPOIS do efeito ser limpo (unmount ou troca de
      // sessão): descarta imediatamente, sem deixar assinatura viva.
      if (cancelled) {
        cleanup();
        return;
      }
      dispose = cleanup;
      cleanupRef.current = cleanup;
    });

    return () => {
      cancelled = true;
      dispose?.();
      dispose = null;
      cleanupRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debugState, sessionId, subject, natsUrl]);

  useEffect(() => {
    if (!sessionExpiresAt) return;
    const expiresAtTs = new Date(sessionExpiresAt).getTime();
    if (Number.isNaN(expiresAtTs)) return;

    const markExpired = () => {
      setExpired(true);
      setLogs((current) => [
        ...current,
        withSystemMessage("Sessão expirada (TTL atingido). O agente já parou de publicar."),
      ]);
    };

    const remainingMs = expiresAtTs - Date.now();
    if (remainingMs <= 0) {
      markExpired();
      return;
    }

    const timerId = window.setTimeout(markExpired, remainingMs);
    return () => {
      window.clearTimeout(timerId);
    };
  }, [sessionExpiresAt]);

  // Aviso de "conectado mas nada chegou": cobre o caso clássico em que o
  // servidor criou a sessão e o agente a recusou (ver agent-service.log).
  const [waitingLongEnough, setWaitingLongEnough] = useState(false);
  useEffect(() => {
    if (debugState !== "running" || connectionState !== "connected" || logs.length > 0) {
      setWaitingLongEnough(false);
      return;
    }
    const timerId = window.setTimeout(() => setWaitingLongEnough(true), WAITING_HINT_MS);
    return () => window.clearTimeout(timerId);
  }, [debugState, connectionState, logs.length]);

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

  /**
   * Troca o nível de log SEM reiniciar: o servidor atualiza o estado/auditoria
   * e entrega setLevel ao agente pelo canal de controle. A sessão, o subject e
   * as linhas já recebidas permanecem.
   */
  const handleSetLevel = async (level: RemoteDebugLogLevel) => {
    if (isRestarting) return;
    setIsRestarting(true);
    setCurrentLevel(level);

    try {
      const result = await agentsApi.setRemoteDebugLogLevel(agentId, sessionId, level);
      setCurrentLevel(result.logLevel);
      setLogs((current) => [
        ...current,
        withSystemMessage(
          `Nível alterado em tempo real para ${LEVEL_LABELS[result.logLevel]} (sem reiniciar a sessão).`,
        ),
      ]);
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Falha ao alterar o nível de log.";
      setErrorMessage(msg);
      setLogs((current) => [...current, withSystemMessage(`Erro: ${msg}`)]);
    } finally {
      setIsRestarting(false);
    }
  };

  const handleCopyLogs = async () => {
    const text = visibleLogs.map(formatLogLine).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopyState("ok");
    } catch {
      setCopyState("error");
    }
    window.setTimeout(() => setCopyState("idle"), 2000);
  };

  const handleDownloadLogs = () => {
    const text = visibleLogs.map(formatLogLine).join("\n");
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `remote-debug-${shortId(resolvedAgentId)}-${new Date()
      .toISOString()
      .replace(/[:.]/g, "-")}.log`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

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
  const expiresLabel = sessionExpiresAt
    ? new Date(sessionExpiresAt).toLocaleTimeString("pt-BR", { hour12: false })
    : "--:--";

  const peerLost = liveness.status === "peer-lost";

  const statusLabel =
    expired
      ? "EXPIRADO"
      : peerLost
        ? "SEM AGENTE"
        : debugState === "running" && connectionState === "connected"
          ? liveness.status === "alive"
            ? "CONECTADO"
            : "AGUARDANDO AGENTE"
          : debugState === "running" && connectionState === "reconnecting"
            ? "RECONECTANDO"
            : debugState === "running" && connectionState === "connecting"
              ? "CONECTANDO"
              : debugState === "stopped"
                ? "PAUSADO"
                : "PRONTO";

  const statusColor: "success" | "warning" | "slate" | "danger" = expired || peerLost
    ? "danger"
    : debugState === "running" && connectionState === "connected"
      ? liveness.status === "alive"
        ? "success"
        : "warning"
      : debugState === "running" && (connectionState === "reconnecting" || connectionState === "connecting")
        ? "warning"
        : debugState === "stopped"
          ? "warning"
          : "slate";

  const clientLabel = target?.clientName || (targetLoading && !subjectIds.clientId ? "…" : shortId(clientId));
  const siteLabel = target?.siteName || (targetLoading && !subjectIds.siteId ? "…" : shortId(siteId));
  const agentLabel = target?.agentName || shortId(resolvedAgentId);

  return (
    <div className="relative flex min-h-screen flex-col bg-background text-foreground">
      {/* Toolbar */}
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border bg-surface/80 px-3 py-2 text-xs">
        <Badge color={statusColor}>{statusLabel}</Badge>

        {/* Hierarquia do alvo: cliente › site › agente */}
        <div className="flex min-w-0 items-center gap-1.5">
          <span
            className="max-w-[14rem] truncate font-medium text-foreground"
            title={clientId ? `Cliente: ${target?.clientName ?? ""} (${clientId})` : "Cliente (não identificado)"}
          >
            {clientLabel}
          </span>
          <span className="text-muted">›</span>
          <span
            className="max-w-[14rem] truncate text-foreground/90"
            title={siteId ? `Site: ${target?.siteName ?? ""} (${siteId})` : "Site (não identificado)"}
          >
            {siteLabel}
          </span>
          <span className="text-muted">›</span>
          <span
            className="max-w-[16rem] truncate font-mono text-foreground/90"
            title={`Agente: ${agentLabel} (${resolvedAgentId})`}
          >
            {agentLabel}
          </span>
        </div>

        <span className="text-muted">·</span>
        <span className="text-muted">{totalLines} linhas</span>
        <span className="text-muted">·</span>
        <span
          className="text-muted"
          title={
            `Expira em ${sessionExpiresAt || "?"}` +
            (maxExpiresAt ? ` (teto: ${maxExpiresAt})` : "")
          }
        >
          exp: {expiresLabel}
        </span>

        <div className="ml-auto flex items-center gap-2">
          {(debugState === "running" || debugState === "stopped") && (
            <>
              {/* Filtro de nível (display only) */}
              <span className="text-muted">filtro:</span>
              {LEVELS.map((level) => (
                <button
                  key={level}
                  type="button"
                  title={`${levelCounts[level]} linha(s) no nível ${LEVEL_LABELS[level]}`}
                  onClick={() =>
                    setLevelFilters((current) => ({
                      ...current,
                      [level]: !current[level],
                    }))
                  }
                  className={`rounded px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider transition-colors ${
                    levelFilters[level]
                      ? "bg-primary/20 text-primary"
                      : "text-muted line-through opacity-60 hover:text-muted-foreground"
                  }`}
                >
                  {level}
                  {levelCounts[level] > 0 && (
                    <span className="ml-1 text-[9px] opacity-70">{levelCounts[level]}</span>
                  )}
                </button>
              ))}
              <button
                type="button"
                onClick={() =>
                  setLevelFilters({ trace: true, debug: true, info: true, warn: true, error: true })
                }
                className="rounded px-1.5 py-0.5 text-[10px] text-muted underline-offset-2 hover:text-foreground hover:underline"
              >
                todos
              </button>
              <button
                type="button"
                onClick={() =>
                  setLevelFilters({ trace: false, debug: false, info: false, warn: false, error: false })
                }
                className="rounded px-1.5 py-0.5 text-[10px] text-muted underline-offset-2 hover:text-foreground hover:underline"
              >
                nenhum
              </button>

              <span className="mx-1 h-4 w-px bg-surface-hover" />

              {/* Nível da sessão (restart) */}
              <span className="text-muted">nível:</span>
              <select
                value={currentLevel}
                onChange={(e) => handleSetLevel(e.target.value as RemoteDebugLogLevel)}
                disabled={isRestarting}
                title="Altera o nível de log em tempo real, sem reiniciar a sessão"
                className="h-6 rounded border border-border bg-surface-light px-2 text-[10px] font-mono uppercase text-foreground outline-none focus:border-primary disabled:opacity-50"
              >
                {LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {LEVEL_LABELS[level]}
                  </option>
                ))}
              </select>

              <span className="mx-1 h-4 w-px bg-surface-hover" />
            </>
          )}

          <Button
            size="sm"
            variant="ghost"
            onClick={() => setAutoScroll((current) => !current)}
            disabled={totalLines === 0}
            title="Alterna a rolagem automática para o fim do console"
            className="text-[10px]"
          >
            scroll: {autoScroll ? "auto" : "manual"}
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={handleCopyLogs}
            disabled={visibleLogs.length === 0}
            title="Copia as linhas visíveis (respeita os filtros)"
            className="text-[10px]"
          >
            {copyState === "ok" ? "copiado" : copyState === "error" ? "falhou" : "copiar"}
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={handleDownloadLogs}
            disabled={visibleLogs.length === 0}
            title="Baixa as linhas visíveis como arquivo .log"
            className="text-[10px]"
          >
            baixar
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => setLogs([])}
            disabled={totalLines === 0}
            className="text-[10px]"
          >
            limpar
          </Button>

          {/* Botão único: iniciar quando parado, parar quando em execução */}
          {debugState === "running" ? (
            <Button size="sm" variant="secondary" onClick={handleStopDebug} className="text-[10px]">
              parar
            </Button>
          ) : (
            <Button size="sm" variant="primary" onClick={handleStartDebug} className="text-[10px]">
              iniciar debug
            </Button>
          )}

          <ThemeToggle />
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
        <span className="text-[10px] text-muted" title={subject}>
          {subject ? `subject: …${subject.slice(-28)}` : "subject: —"}
        </span>
      </div>
      )}

      {/* Log area */}
      <div
        ref={consoleRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-3 py-2 font-mono text-xs leading-relaxed"
      >
        {visibleLogs.length === 0 && (
          <div className="py-12 text-center text-sm text-muted">
            <p>
              {debugState === "idle"
                ? "Console pronto. Clique em \"iniciar debug\" para começar a receber logs."
                : debugState === "stopped"
                  ? "Debug pausado. Clique em \"iniciar debug\" para retomar."
                  : connectionState === "connected"
                    ? "Aguardando entradas de log..."
                    : "Nenhuma linha para exibir."}
            </p>
            {waitingLongEnough && (
              <p className="mx-auto mt-3 max-w-xl rounded border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
                Conectado, mas nenhum log chegou em {Math.round(WAITING_HINT_MS / 1000)}s. Isso
                normalmente significa que o <strong>agente não aceitou a sessão</strong>:
                confira o <code className="font-mono">agent-service.log</code> do agente
                procurando por <code className="font-mono">[remote-debug]</code> e o
                resultado do comando <code className="font-mono">remotedebug</code>{" "}
                (exitCode=1 indica falha ao iniciar a sessão no agente).
              </p>
            )}
          </div>
        )}

        {visibleLogs.map((entry, index) => {
          const level = normalizeLevel(entry.level);
          return (
            <div
              key={`${entry.sessionId}-${entry.sequence ?? index}-${entry.timestampUtc}-${index}`}
              className="flex items-start gap-2 rounded px-1 py-0.5 hover:bg-surface-light"
            >
              <span className="shrink-0 text-muted">
                {formatTimestamp(entry.timestampUtc)}
              </span>
              <span className="inline-block w-12 shrink-0">
                <Badge color={levelBadgeColor(level)}>{level.toUpperCase()}</Badge>
              </span>
              <span className="break-all text-foreground">
                {entry.message}
              </span>
            </div>
          );
        })}
      </div>

      {/* Erro em faixa (não em overlay): mantém a barra de identidade, os
          filtros e o botão de copiar/baixar utilizáveis durante o diagnóstico. */}
      {errorMessage && (
        <div className="flex items-start gap-2 border-b border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
          <span className="flex-1 whitespace-pre-wrap break-words">{errorMessage}</span>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="shrink-0 rounded px-1.5 py-0.5 text-[10px] underline-offset-2 hover:underline"
          >
            fechar
          </button>
        </div>
      )}
    </div>
  );
}
