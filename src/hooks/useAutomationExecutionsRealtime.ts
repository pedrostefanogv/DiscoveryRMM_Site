import { useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getNatsService, type DashboardEvent } from "@/api/nats";
import { realtimeConfig } from "@/config/realtime";
import {
  buildDashboardNatsSubjects,
  type DashboardNatsScope,
} from "@/utils/natsSubjects";

const NATS_ENABLED = realtimeConfig.useNats && realtimeConfig.natsEnabled;

/** Raiz das queries de execuções (invalida todas as variantes de filtro/limite). */
export const AUTOMATION_EXECUTIONS_QUERY_KEY = ["automationExecutions"] as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * O backend publica `AutomationExecutionCreated/Acknowledged/Result` no canal de
 * dashboard quando uma execução muda de estado. Filtramos por prefixo (tipos
 * canônicos) e pelo agentId do payload — eventos de outros agentes do mesmo
 * site não devem invalidar a consulta deste agente.
 *
 * Evento sem agentId é aceito (invalida por segurança): melhor um refetch extra
 * do que uma tela presa em "aguardando agent…".
 */
export function isAutomationExecutionEventForAgent(
  event: DashboardEvent | Record<string, unknown> | null | undefined,
  agentId: string,
): boolean {
  const record = asRecord(event);
  if (!record) return false;

  const eventType = typeof record.eventType === "string" ? record.eventType : "";
  if (!eventType.toLowerCase().startsWith("automationexecution")) return false;

  const data = asRecord(record.data) ?? record;
  const eventAgentId = typeof data.agentId === "string" ? data.agentId : undefined;

  return !eventAgentId || eventAgentId === agentId;
}

export interface AutomationRealtimeScope {
  clientId: string;
  siteId?: string | null;
}

/**
 * Atualiza o histórico de execuções em tempo (quase) real via NATS, sem depender
 * do polling de 3s. O polling continua como fallback quando o NATS está
 * indisponível — este hook nunca bloqueia a UI, apenas invalida a query.
 */
export function useAutomationExecutionsRealtime(
  scope: AutomationRealtimeScope,
  agentId: string,
  enabled = true,
) {
  const queryClient = useQueryClient();
  const scopeKey = `${scope.clientId}|${scope.siteId ?? ""}|${agentId}`;

  const stableScope = useMemo<AutomationRealtimeScope>(
    () => ({ clientId: scope.clientId, siteId: scope.siteId }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scopeKey],
  );

  useEffect(() => {
    if (!enabled || !agentId || !stableScope.clientId) return;
    if (!NATS_ENABLED || !realtimeConfig.natsUrl) return;

    let disposed = false;

    const natsScope: DashboardNatsScope = stableScope.siteId
      ? { level: "site", clientId: stableScope.clientId, siteId: stableScope.siteId }
      : { level: "client", clientId: stableScope.clientId };

    const subjects = buildDashboardNatsSubjects(natsScope, {
      includeScopedFallbacks: true,
      includeSiteWildcardForClientScope: true,
      includeGlobalWildcardSubjects: true,
    });

    // "preserve": não reposiciona a conexão compartilhada usada pelo dashboard e
    // por outros consumidores; subjects fora da allow-list do token são ignorados.
    const natsService = getNatsService({
      url: realtimeConfig.natsUrl,
      enabled: NATS_ENABLED,
      authMode: realtimeConfig.natsAuthMode,
      clientId: stableScope.clientId,
      siteId: stableScope.siteId ?? undefined,
      scopeMode: "preserve",
    });

    const onEvent = (event: DashboardEvent | Record<string, unknown>) => {
      if (disposed) return;
      if (!isAutomationExecutionEventForAgent(event, agentId)) return;
      void queryClient.invalidateQueries({ queryKey: AUTOMATION_EXECUTIONS_QUERY_KEY });
    };

    void (async () => {
      let connected = false;
      try {
        connected = await natsService.connect();
      } catch (error) {
        // Realtime é otimização: falha de conexão não pode afetar a página
        // (o polling de 3s continua como fallback).
        console.debug("[NATS][automation] Falha ao conectar para tempo real:", error);
        return;
      }
      if (disposed || !connected) return;

      for (const subject of subjects) {
        if (!natsService.canSubscribeToSubject(subject)) {
          console.debug(
            "[NATS][automation] Subject fora da allow-list do token, ignorando:",
            subject,
          );
          continue;
        }

        void natsService.subscribe(subject, onEvent, { connectIfNeeded: false });
      }
    })();

    return () => {
      disposed = true;
      subjects.forEach((subject) => natsService.unsubscribe(subject, onEvent));
    };
  }, [agentId, enabled, queryClient, stableScope]);
}
