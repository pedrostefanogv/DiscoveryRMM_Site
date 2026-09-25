import { useCallback, useEffect, useRef, useState } from "react";
import { resolveLivenessParams } from "@/api/sessionLiveness";
import { createBackgroundTimer } from "@/hooks/createBackgroundTimer";

export type SessionLivenessStatus = "idle" | "alive" | "peer-lost" | "expired";

export interface SessionLivenessKeepAliveResult {
  expiresAtUtc: string;
  maxExpiresAtUtc?: string | null;
  sessionActive: boolean;
  endReason?: string | null;
}

export interface UseSessionLivenessOptions {
  /** Liga/desliga o keepalive e o watchdog (ex.: pausado pelo usuario). */
  enabled: boolean;
  sessionId: string;
  /** Estado da conexao NATS do viewer. */
  connectionState: "connecting" | "connected" | "reconnecting" | "closed";
  pingIntervalSeconds?: number;
  missedPingsBeforeClose?: number;
  initialGraceSeconds?: number;
  keepAliveSeconds?: number;
  /** Publica um ping no subject unico de controle. */
  sendPing: (sequence: number) => void;
  /** Renova a sessao no servidor (HTTP). */
  keepAlive?: () => Promise<SessionLivenessKeepAliveResult>;
  onKeepAlive?: (result: SessionLivenessKeepAliveResult) => void;
  onPeerLost?: () => void;
  onExpired?: (reason: string) => void;
  onStatus?: (status: SessionLivenessStatus) => void;
}

const RECONNECT_GIVE_UP_MS = 60_000;

/**
 * Nucleo reutilizavel de liveness de sessao remota (browser <-> agente),
 * agnostico ao debug: recebe as funcoes de sinal e keepalive por parametro.
 *
 * Regras:
 * - ping a cada Interval, enquanto a conexao estiver "connected";
 * - ausencia do peer so conta em "connected": grace inicial para o 1o sinal,
 *   depois missedPingsBeforeClose * Interval sem sinal;
 * - em "reconnecting" o timer pausa e so encerra apos 60s continuos;
 * - keepalive HTTP renova o TTL no servidor (evita sessao presa).
 */
export function useSessionLiveness(options: UseSessionLivenessOptions) {
  const [status, setStatus] = useState<SessionLivenessStatus>("idle");
  const statusRef = useRef<SessionLivenessStatus>("idle");
  const peerSeenRef = useRef(false);
  const lastPeerAtRef = useRef(0);
  const startedAtRef = useRef(Date.now());
  const reconnectSinceRef = useRef(0);
  const lostFiredRef = useRef(false);
  const seqRef = useRef(0);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const setStatusSafe = useCallback((next: SessionLivenessStatus) => {
    if (statusRef.current !== next) {
      statusRef.current = next;
      setStatus(next);
      optionsRef.current.onStatus?.(next);
    }
  }, []);

  const notePeerSignal = useCallback(() => {
    peerSeenRef.current = true;
    lastPeerAtRef.current = Date.now();
    lostFiredRef.current = false;
    if (statusRef.current !== "alive") setStatusSafe("alive");
  }, [setStatusSafe]);

  // Reinicia o estado quando troca de sessao (ex.: restart com novo sessionId).
  // Reinicia ao trocar de sessão E ao reabilitar (pausar/retomar): sem isso, o
  // tempo parado contaria como ausência e o console fecharia a sessão no
  // primeiro tick após o "iniciar debug".
  useEffect(() => {
    if (!options.enabled) return;
    peerSeenRef.current = false;
    lastPeerAtRef.current = 0;
    startedAtRef.current = Date.now();
    reconnectSinceRef.current = 0;
    lostFiredRef.current = false;
    seqRef.current = 0;
    setStatusSafe("idle");
  }, [options.sessionId, options.enabled, setStatusSafe]);

  const { enabled, connectionState, sessionId } = options;

  useEffect(() => {
    if (!enabled) return;
    const params = resolveLivenessParams(optionsRef.current);

    const stopTimer = createBackgroundTimer(params.pingIntervalMs, () => {
      const now = Date.now();
      const conn = optionsRef.current.connectionState;

      if (conn === "connected") {
        reconnectSinceRef.current = 0;
        const seen = peerSeenRef.current;
        const tolerance = seen
          ? params.missedPingsBeforeClose * params.pingIntervalMs
          : params.initialGraceMs;
        const reference = seen ? lastPeerAtRef.current : startedAtRef.current;
        if (now - reference > tolerance) {
          if (!lostFiredRef.current) {
            lostFiredRef.current = true;
            setStatusSafe("peer-lost");
            optionsRef.current.onPeerLost?.();
          }
          return;
        }
        seqRef.current += 1;
        optionsRef.current.sendPing(seqRef.current);
        return;
      }

      if (conn === "reconnecting") {
        if (reconnectSinceRef.current === 0) reconnectSinceRef.current = now;
        if (now - reconnectSinceRef.current > RECONNECT_GIVE_UP_MS) {
          if (!lostFiredRef.current) {
            lostFiredRef.current = true;
            setStatusSafe("peer-lost");
            optionsRef.current.onPeerLost?.();
          }
        }
      }
    });

    return stopTimer;
  }, [enabled, connectionState, sessionId, setStatusSafe]);

  useEffect(() => {
    if (!enabled) return;
    const keepAlive = optionsRef.current.keepAlive;
    if (!keepAlive) return;

    const params = resolveLivenessParams(optionsRef.current);
    let cancelled = false;
    let finished = false;

    const run = async () => {
      if (cancelled || finished) return;
      try {
        const result = await keepAlive();
        if (cancelled || finished) return;
        if (!result.sessionActive) {
          // Sessao encerrada no servidor (teto/keepalive): dispara UMA vez e
          // para de renovar — sem isso o keepalive ficaria em loop silencioso.
          finished = true;
          setStatusSafe("expired");
          optionsRef.current.onExpired?.(result.endReason ?? "sessao-encerrada");
          return;
        }
        optionsRef.current.onKeepAlive?.(result);
      } catch (error) {
        // 400/403/404 = a sessao nao existe mais no servidor (API reiniciada
        // perdeu o estado em memoria, prune do cleanup, ou acesso negado).
        // E terminal: sem isso o keepalive falhava em loop silencioso e o
        // console ficava preso em "AGUARDANDO AGENTE" sem nenhuma explicacao
        // (HAR: 404 "Remote debug session not found" ~1s apos abrir).
        // Le apenas a propriedade `status` (ApiError a expoe): usar
        // `instanceof` acoplaria o hook ao modulo @/api, que nao pode ser
        // mockado nos testes do console.
        const status = (error as { status?: number } | null | undefined)?.status;
        if (status === 400 || status === 403 || status === 404) {
          finished = true;
          setStatusSafe("expired");
          optionsRef.current.onExpired?.("sessao-nao-encontrada");
          return;
        }
        // Erro de rede/5xx: tenta no proximo ciclo. Erros de negocio (sessao
        // encerrada) chegam como sessionActive=false e encerram acima.
      }
    };

    void run();
    const stopTimer = createBackgroundTimer(params.keepAliveMs, () => {
      void run();
    });

    // Aba/popup em segundo plano: o navegador estrangula o setInterval e a
    // maquina pode hibernar. Ao recuperar foco/visibilidade renovamos na hora,
    // em vez de esperar o proximo ciclo (que podia chegar depois do servidor
    // encerrar por keepalive-timeout).
    const resume = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void run();
    };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("focus", resume);

    return () => {
      cancelled = true;
      stopTimer();
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("focus", resume);
    };
  }, [enabled, sessionId, setStatusSafe]);

  return { status, notePeerSignal };
}
