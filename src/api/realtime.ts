import { getNatsService } from "./nats";
import { api } from "./client";

export interface AgentCommand {
  commandId: string;
  commandType: string;
  payload: string;
}

export interface AgentHeartbeat {
  agentId: string;
  ipAddress?: string;
  agentVersion?: string;
}

export interface RealtimeStatsResponse {
  checkedAtUtc?: string;
  application: {
    environment?: string | null;
    machineName?: string | null;
    processId?: number | null;
    startedAtUtc?: string | null;
    uptime?: string | number | null;
    uptimeSeconds?: number | null;
  };
  realtime: {
    signalrConnectedAgents: number;
    natsConnected: boolean;
    natsConnectionState?: string | null;
    natsTcpReachable?: boolean | null;
    redisConnected: boolean;
    redisConnectionState?: string | null;
    redisPingMs?: number | null;
  };
  database: {
    provider?: string | null;
    connected: boolean;
  };
  processMetrics: {
    workingSetBytes?: number | null;
    gcHeapBytes?: number | null;
    workingSetMb?: number | null;
    gcManagedMemoryMb?: number | null;
    threadCount?: number | null;
  };
  threadPool: {
    workerAvailable?: number | null;
    ioAvailable?: number | null;
    workerMin?: number | null;
    ioMin?: number | null;
    availableWorkers?: number | null;
    availableIo?: number | null;
    minWorkers?: number | null;
    minIo?: number | null;
  };
  business: {
    available: boolean;
    clients?: { total: number };
    sites?: { total: number };
    agents?: {
      total: number;
      online: number;
      offline: number;
      maintenance?: number;
      error?: number;
    };
    commands?: {
      total: number;
      pending: number;
      sent: number;
      running: number;
      completed: number;
      failed: number;
    };
    tickets?: {
      total: number;
      open: number;
      closed: number;
    };
  };
}

/**
 * Send a command to an agent via NATS
 * Falls back to REST API if NATS is not available
 */
export async function sendAgentCommand(
  agentId: string,
  command: AgentCommand,
): Promise<void> {
  const natsService = getNatsService();

  if (natsService.isConnected()) {
    try {
      const subject = `agent.${agentId}.command`;
      await natsService.publish(
        subject,
        command as unknown as Record<string, unknown>,
      );
      return;
    } catch (error) {
      console.error(
        "Failed to send command via NATS, falling back to REST:",
        error,
      );
    }
  }

  // Fallback to REST API
  return api.post(`/agents/${agentId}/commands`, command);
}

/**
 * Get realtime status from backend
 */
export async function getRealtimeStatus() {
  return api.get<{
    natsConnected: boolean;
    signalrConnectedAgents: number;
    checkedAtUtc: string;
  }>("/api/realtime/status");
}

/**
 * Get full realtime/infra/business telemetry for the dashboard.
 */
export async function getRealtimeStats() {
  return api.get<RealtimeStatsResponse>("/api/realtime/stats");
}
