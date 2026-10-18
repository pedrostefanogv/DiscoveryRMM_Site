import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getNatsService, type DashboardEvent } from "@/api/nats";
import { realtimeConfig } from "@/config/realtime";
import { buildDashboardNatsSubjects } from "@/utils/natsSubjects";

const NATS_ENABLED = realtimeConfig.useNats && realtimeConfig.natsEnabled;

const PATCH_EVENT_TYPES = new Set([
  "PatchScanCompleted",
  "PatchInstallCompleted",
  "PatchApprovalChanged",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Assina os eventos de patch do dashboard (NATS) e invalida as queries de
 * patches/inventário do agente. É complemento do polling curto: a tela reflete
 * scan/instalação/aprovação praticamente em tempo real.
 */
export function usePatchesRealtime(enabled = true) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled || !NATS_ENABLED || !realtimeConfig.natsUrl) return;

    let disposed = false;
    const subjects = buildDashboardNatsSubjects(
      { level: "global" },
      { includeScopedFallbacks: true, includeGlobalWildcardSubjects: true },
    );
    const natsService = getNatsService({
      url: realtimeConfig.natsUrl,
      enabled: NATS_ENABLED,
      authMode: realtimeConfig.natsAuthMode,
      scopeMode: "replace",
    });

    const onEvent = (event: DashboardEvent | Record<string, unknown>) => {
      if (disposed || !isRecord(event)) return;
      const eventType = typeof event.eventType === "string" ? event.eventType : "";
      if (!PATCH_EVENT_TYPES.has(eventType)) return;

      void queryClient.invalidateQueries({ queryKey: ["patches"] });
      void queryClient.invalidateQueries({ queryKey: ["agentWindowsUpdates"] });
      void queryClient.invalidateQueries({ queryKey: ["agents"] });
    };

    void (async () => {
      const connected = await natsService.connect();
      if (disposed || !connected) return;

      for (const subject of subjects) {
        if (!natsService.canSubscribeToSubject(subject)) continue;
        void natsService.subscribe(subject, onEvent, { connectIfNeeded: false });
      }
    })();

    return () => {
      disposed = true;
      subjects.forEach((subject) => natsService.unsubscribe(subject, onEvent));
    };
  }, [enabled, queryClient]);
}
