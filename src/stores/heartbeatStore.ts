import { useSyncExternalStore } from "react";
import type { AgentHeartbeat, AgentHeartbeatMetrics } from "@/api";

const DEFAULT_HEARTBEAT_METRICS_TTL_MS = 60_000;

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
  Omit<AgentHeartbeat, "agentId" | "status">;

type Listener = () => void;

export function isHeartbeatTimestampFresh(
  timestampUtc: string | undefined | null,
  now = Date.now(),
  ttlMs = HEARTBEAT_METRICS_TTL_MS,
): boolean {
  if (!timestampUtc) return false;
  const timestampMs = new Date(timestampUtc).getTime();
  if (!Number.isFinite(timestampMs)) return false;
  return now - timestampMs <= ttlMs;
}

/** Extract AgentHeartbeatMetrics from an AgentHeartbeat payload */
export function extractHeartbeatMetrics(data: AgentHeartbeat): AgentHeartbeatMetrics {
  return {
    cpuPercent: data.cpuPercent,
    memoryPercent: data.memoryPercent,
    diskPercent: data.diskPercent,
    memoryTotalGb: data.memoryTotalGb,
    memoryUsedGb: data.memoryUsedGb,
    diskTotalGb: data.diskTotalGb,
    diskUsedGb: data.diskUsedGb,
    p2pPeers: data.p2pPeers,
    uptimeSeconds: data.uptimeSeconds,
    processCount: data.processCount,
    ipAddress: data.ipAddress,
    hostname: data.hostname,
    agentVersion: data.agentVersion,
    timestampUtc: data.timestampUtc,
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

    this.heartbeats.set(agentId, {
      ...current,
      ...data,
      agentId,
      timestampUtc: data.timestampUtc ?? nowIso,
    });

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
    if (this.heartbeats.delete(agentId)) {
      this.emit();
    }
  }

  removeHeartbeatIfStale(
    agentId: string,
    ttlMs = HEARTBEAT_METRICS_TTL_MS,
    now = Date.now(),
  ): boolean {
    const heartbeat = this.heartbeats.get(agentId);
    if (!heartbeat) return false;
    if (isHeartbeatTimestampFresh(heartbeat.timestampUtc, now, ttlMs)) {
      return false;
    }

    this.heartbeats.delete(agentId);
    this.emit();
    return true;
  }

  /** Clear all heartbeats */
  clear(): void {
    if (this.heartbeats.size === 0) return;
    this.heartbeats.clear();
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

/** React hook — returns heartbeat data for a specific agent, updated reactively */
export function useAgentHeartbeat(agentId: string): HeartbeatPayload | undefined {
  return useSyncExternalStore(
    (cb) => heartbeatStore.subscribe(cb),
    () => heartbeatStore.getHeartbeat(agentId),
    () => heartbeatStore.getHeartbeat(agentId),
  );
}

/** React hook — returns ALL heartbeats, updated reactively */
export function useAllAgentHeartbeats(): ReadonlyMap<string, HeartbeatPayload> {
  return useSyncExternalStore(
    (cb) => heartbeatStore.subscribe(cb),
    () => heartbeatStore.getSnapshot(),
    () => heartbeatStore.getSnapshot(),
  );
}
