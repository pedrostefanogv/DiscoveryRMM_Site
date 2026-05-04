import { useSyncExternalStore } from "react";
import type { AgentHeartbeat } from "@/api";

type HeartbeatPayload = Required<Pick<AgentHeartbeat, "agentId" | "status">> &
  Omit<AgentHeartbeat, "agentId" | "status">;

type Listener = () => void;

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
    const current = this.heartbeats.get(agentId) ?? {
      agentId,
      status: "Online" as const,
    };

    this.heartbeats.set(agentId, {
      ...current,
      ...data,
      agentId,
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
