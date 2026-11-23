import { useMemo } from 'react';
import type { AgentHeartbeatMetrics } from '@/api';
import { AgentHeartbeatCard } from '@/components/ui';
import { useNowTick } from '@/hooks/useNowTick';
import { isHeartbeatTimestampFresh, useAgentHeartbeat } from '@/stores/heartbeatStore';

interface LiveAgentHeartbeatCardProps {
  agentId: string;
  fallbackMetrics?: AgentHeartbeatMetrics | null;
}

/**
 * Isola a assinatura de `useAgentHeartbeat` para que ticks de CPU/RAM/disco
 * re-renderizem apenas este card em vez da página inteira de detalhe do agente.
 */
export function LiveAgentHeartbeatCard({ agentId, fallbackMetrics }: LiveAgentHeartbeatCardProps) {
  const liveHeartbeat = useAgentHeartbeat(agentId);
  const now = useNowTick(15_000);

  const metrics = useMemo<AgentHeartbeatMetrics | undefined>(() => {
    const hasFreshLive =
      liveHeartbeat &&
      isHeartbeatTimestampFresh(
        liveHeartbeat.timestampUtc,
        now,
        undefined,
        liveHeartbeat.receivedAtUtc,
      );

    if (hasFreshLive) {
      return {
        cpuPercent: liveHeartbeat.cpuPercent,
        memoryPercent: liveHeartbeat.memoryPercent,
        diskPercent: liveHeartbeat.diskPercent,
        memoryTotalGb: liveHeartbeat.memoryTotalGb,
        memoryUsedGb: liveHeartbeat.memoryUsedGb,
        diskTotalGb: liveHeartbeat.diskTotalGb,
        diskUsedGb: liveHeartbeat.diskUsedGb,
        diskReadPercent: liveHeartbeat.diskReadPercent,
        diskWritePercent: liveHeartbeat.diskWritePercent,
        diskResponseMs: liveHeartbeat.diskResponseMs,
        p2pPeers: liveHeartbeat.p2pPeers,
        uptimeSeconds: liveHeartbeat.uptimeSeconds,
        processCount: liveHeartbeat.processCount,
        cpuTemperatureCelsius: liveHeartbeat.cpuTemperatureCelsius,
        // Energia: repassada como veio (undefined = não reportado).
        hasBattery: liveHeartbeat.hasBattery,
        batteryPercent: liveHeartbeat.batteryPercent,
        batteryOnAc: liveHeartbeat.batteryOnAc,
        batteryCharging: liveHeartbeat.batteryCharging,
        ipAddress: liveHeartbeat.ipAddress,
        hostname: liveHeartbeat.hostname,
        agentVersion: liveHeartbeat.agentVersion,
        timestampUtc: liveHeartbeat.timestampUtc,
      };
    }

    if (
      fallbackMetrics &&
      isHeartbeatTimestampFresh(
        fallbackMetrics.timestampUtc,
        now,
        undefined,
        fallbackMetrics.receivedAtUtc,
      )
    ) {
      return fallbackMetrics;
    }

    return undefined;
  }, [liveHeartbeat, fallbackMetrics, now]);

  return <AgentHeartbeatCard metrics={metrics} showEmpty />;
}
