import { useEffect, useState } from "react";
import { getNatsService } from "@/api/nats";
import { realtimeConfig } from "@/config/realtime";

export interface RealtimeConnectionStatus {
  natsConnected: boolean;
  signalrConnected: boolean;
  checkedAtUtc: string;
  provider: string;
}

/**
 * Hook to monitor realtime connection status
 * Checks both NATS and SignalR connections
 */
export function useRealtimeStatus() {
  const [status, setStatus] = useState<RealtimeConnectionStatus>({
    natsConnected: false,
    signalrConnected: false,
    checkedAtUtc: new Date().toISOString(),
    provider: realtimeConfig.provider,
  });

  useEffect(() => {
    const interval = setInterval(() => {
      const natsService = getNatsService();
      setStatus({
        natsConnected: realtimeConfig.useNats && natsService.isConnected(),
        signalrConnected: realtimeConfig.useSignalR, // SignalR status would need to be tracked separately
        checkedAtUtc: new Date().toISOString(),
        provider: realtimeConfig.provider,
      });
    }, 5000); // Check every 5 seconds

    // Initial check
    const natsService = getNatsService();
    setStatus({
      natsConnected: realtimeConfig.useNats && natsService.isConnected(),
      signalrConnected: realtimeConfig.useSignalR,
      checkedAtUtc: new Date().toISOString(),
      provider: realtimeConfig.provider,
    });

    return () => clearInterval(interval);
  }, []);

  return status;
}
