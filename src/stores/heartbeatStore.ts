import { useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import type { AgentHeartbeat, AgentHeartbeatMetrics } from "@/api";

const DEFAULT_HEARTBEAT_METRICS_TTL_MS = 90_000;

function parseHeartbeatMetricsTtlMs(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_HEARTBEAT_METRICS_TTL_MS;
  }
  return parsed;
}

export const HEARTBEAT_METRICS_TTL_MS = parseHeartbeatMetricsTtlMs(
  import.meta.env.VITE_AGENT_HEARTBEAT_METRICS_TTL_MS,
);

type HeartbeatPayload = Required<Pick<AgentHeartbeat, "agentId" | "status">> &
  Omit<AgentHeartbeat, "agentId" | "status"> & {
    receivedAtUtc?: string;
  };

type Listener = () => void;

function toEpochMs(value: string | undefined | null): number | null {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

export function isHeartbeatTimestampFresh(
  timestampUtc: string | undefined | null,
  now = Date.now(),
  ttlMs = HEARTBEAT_METRICS_TTL_MS,
  receivedAtUtc?: string | null,
): boolean {
  // Prefer local receive time for freshness to avoid clock skew from agent payload.
  const referenceMs = toEpochMs(receivedAtUtc) ?? toEpochMs(timestampUtc);
  if (referenceMs == null) return false;
  return now - referenceMs <= ttlMs;
}

/** Extract AgentHeartbeatMetrics from an AgentHeartbeat payload */
export function extractHeartbeatMetrics(
  data: AgentHeartbeat,
): AgentHeartbeatMetrics {
  return {
    cpuPercent: data.cpuPercent,
    memoryPercent: data.memoryPercent,
    diskPercent: data.diskPercent,
    memoryTotalGb: data.memoryTotalGb,
    memoryUsedGb: data.memoryUsedGb,
    diskTotalGb: data.diskTotalGb,
    diskUsedGb: data.diskUsedGb,
    diskReadPercent: data.diskReadPercent,
    diskWritePercent: data.diskWritePercent,
    diskResponseMs: data.diskResponseMs,
    p2pPeers: data.p2pPeers,
    uptimeSeconds: data.uptimeSeconds,
    processCount: data.processCount,
    cpuTemperatureCelsius: data.cpuTemperatureCelsius,
    ipAddress: data.ipAddress,
    hostname: data.hostname,
    agentVersion: data.agentVersion,
    timestampUtc: data.timestampUtc,
    receivedAtUtc: new Date().toISOString(),
    // Energia (bateria × tomada): repassada como veio — undefined continua
    // "não reportado" e a UI esconde o bloco em vez de mostrar "sem bateria".
    hasBattery: data.hasBattery,
    batteryPercent: data.batteryPercent,
    batteryOnAc: data.batteryOnAc,
    batteryCharging: data.batteryCharging,
  };
}

class HeartbeatStore {
  private heartbeats = new Map<string, HeartbeatPayload>();
  private listeners = new Set<Listener>();

  private emit() {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        // Silently ignore listener errors
      }
    }
  }

  /** Update or insert heartbeat data for a given agentId */
  setHeartbeat(agentId: string, data: Partial<AgentHeartbeat>): void {
    const nowIso = new Date().toISOString();
    const current = this.heartbeats.get(agentId) ?? {
      agentId,
      status: "Online" as const,
    };

    const next = new Map(this.heartbeats);
    next.set(agentId, {
      ...current,
      ...data,
      agentId,
      timestampUtc: data.timestampUtc ?? nowIso,
      receivedAtUtc: nowIso,
    });
    this.heartbeats = next;

    this.emit();
  }

  /** Get the latest heartbeat for a single agent */
  getHeartbeat(agentId: string): HeartbeatPayload | undefined {
    return this.heartbeats.get(agentId);
  }

  /** Get all heartbeats */
  getAllHeartbeats(): ReadonlyMap<string, HeartbeatPayload> {
    return this.heartbeats;
  }

  /** Remove heartbeat data for an agent (e.g. when agent goes offline) */
  removeHeartbeat(agentId: string): void {
    if (!this.heartbeats.has(agentId)) return;
    const next = new Map(this.heartbeats);
    next.delete(agentId);
    this.heartbeats = next;
    this.emit();
  }

  removeHeartbeatIfStale(
    agentId: string,
    ttlMs = HEARTBEAT_METRICS_TTL_MS,
    now = Date.now(),
  ): boolean {
    const heartbeat = this.heartbeats.get(agentId);
    if (!heartbeat) return false;
    if (
      isHeartbeatTimestampFresh(
        heartbeat.timestampUtc,
        now,
        ttlMs,
        heartbeat.receivedAtUtc,
      )
    ) {
      return false;
    }

    const next = new Map(this.heartbeats);
    next.delete(agentId);
    this.heartbeats = next;
    this.emit();
    return true;
  }

  /** Clear all heartbeats */
  clear(): void {
    if (this.heartbeats.size === 0) return;
    this.heartbeats = new Map();
    this.emit();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(): ReadonlyMap<string, HeartbeatPayload> {
    return this.heartbeats;
  }
}

export const heartbeatStore = new HeartbeatStore();

/**
 * Assinatura com flush SÍNCRONO: mutações do store vindas de FORA do React
 * (expiração de TTL, eventos de realtime) precisam refletir no DOM na mesma
 * chamada — o scheduler do React 19 só descarregaria na microtask seguinte,
 * deixando leitores imediatos (ex.: checagem pós-remoção de heartbeat stale)
 * vendo o valor antigo.
 */
function subscribeFlushed(listener: () => void): () => void {
  return heartbeatStore.subscribe(() => flushSync(listener));
}

/** React hook — returns heartbeat data for a specific agent, updated reactively */
export function useAgentHeartbeat(
  agentId: string,
): HeartbeatPayload | undefined {
  return useSyncExternalStore(
    subscribeFlushed,
    () => heartbeatStore.getHeartbeat(agentId),
    () => heartbeatStore.getHeartbeat(agentId),
  );
}

/**
 * Assinatura leve apenas dos campos de identidade/sessão do heartbeat.
 * Retorna string primitiva para que ticks de CPU/RAM/disco não re-renderizem
 * a página inteira de detalhe do agente.
 */
export function useAgentHeartbeatSummary(agentId: string): string {
  return useSyncExternalStore(
    subscribeFlushed,
    () => {
      const hb = heartbeatStore.getHeartbeat(agentId);
      if (!hb) return '';
      const fresh = isHeartbeatTimestampFresh(hb.timestampUtc, Date.now(), undefined, hb.receivedAtUtc);
      if (!fresh) return '';
      return JSON.stringify([
        hb.status,
        hb.loggedUser ?? null,
        hb.loggedUserSince ?? null,
        hb.ipAddress ?? null,
        hb.hostname ?? null,
        hb.agentVersion ?? null,
      ]);
    },
    () => '',
  );
}

/** React hook — returns ALL heartbeats, updated reactively */
export function useAllAgentHeartbeats(): ReadonlyMap<string, HeartbeatPayload> {
  return useSyncExternalStore(
    subscribeFlushed,
    () => heartbeatStore.getSnapshot(),
    () => heartbeatStore.getSnapshot(),
  );
}
