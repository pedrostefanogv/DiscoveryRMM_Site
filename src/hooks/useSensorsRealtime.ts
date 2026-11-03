import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getNatsService, type DashboardEvent } from "@/api/nats";
import { realtimeConfig } from "@/config/realtime";
import {
  buildDashboardNatsSubjects,
  type DashboardNatsScope,
} from "@/utils/natsSubjects";
import { invalidateThrottled } from "@/utils/invalidationThrottle";
import { SENSOR_KEYS } from "./useSensors";

const NATS_ENABLED = realtimeConfig.useNats && realtimeConfig.natsEnabled;

/** Tipo do evento publicado pelo servidor quando o estado de um sensor muda. */
export const SENSOR_STATUS_CHANGED_EVENT = "SensorStatusChanged";

/**
 * Um ciclo de coleta de N sensores publica N eventos quase no mesmo instante.
 * Sem throttle, um agente com 20 sensores refazia o payload da aba 20 vezes em
 * poucos segundos — o polling de 30s já cobre o caso "perdi o evento", então a
 * invalidação por evento pode ser espaçada.
 */
const SENSORS_INVALIDATE_MIN_INTERVAL_MS = 5_000;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * O evento de status de sensor é global (o servidor publica no canal de
 * dashboard do cliente/site), então o filtro é duplo:
 *
 * 1. eventType === "SensorStatusChanged" (só esse domínio interessa);
 * 2. agentId do payload, quando presente — eventos de outros agentes do mesmo
 *    site não devem invalidar a aba deste agente.
 *
 * Evento sem agentId é aceito (melhor um refetch extra do que uma tela presa em
 * "aguardando coleta").
 */
export function isSensorStatusChangedForAgent(
  event: DashboardEvent | Record<string, unknown> | null | undefined,
  agentId: string,
): boolean {
  const record = asRecord(event);
  if (!record) return false;

  const eventType = typeof record.eventType === "string" ? record.eventType : "";
  if (eventType !== SENSOR_STATUS_CHANGED_EVENT) return false;

  const data = asRecord(record.data) ?? record;
  const eventAgentId = typeof data.agentId === "string" ? data.agentId : undefined;

  return !eventAgentId || eventAgentId === agentId;
}

/**
 * Tempo (quase) real da aba "Sensores": assina os eventos de dashboard via NATS
 * e invalida a query do agente quando o status de qualquer sensor muda.
 *
 * O polling de 30s de useAgentSensors continua como fallback: se o NATS estiver
 * indisponível (ou o token não permitir os subjects), a aba segue atualizando —
 * este hook nunca bloqueia a UI, apenas invalida o cache.
 *
 * enabled existe porque a aba do agente fica SEMPRE montada (regras de hooks) e
 * só deve assinar quando está ativa e o usuário tem Sensors.View.
 */
export function useSensorsRealtime(
  agentId: string | null | undefined,
  enabled = true,
  clientId?: string | null,
  siteId?: string | null,
) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled || !agentId) return;
    if (!NATS_ENABLED || !realtimeConfig.natsUrl) return;

    let disposed = false;

    const scope: DashboardNatsScope =
      clientId && siteId
        ? { level: "site", clientId, siteId }
        : clientId
          ? { level: "client", clientId }
          : { level: "global" };

    const subjects = buildDashboardNatsSubjects(scope, {
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
      clientId: clientId ?? undefined,
      siteId: siteId ?? undefined,
      scopeMode: "preserve",
    });

    const onEvent = (event: DashboardEvent | Record<string, unknown>) => {
      if (disposed) return;
      if (!isSensorStatusChangedForAgent(event, agentId)) return;
      invalidateThrottled(
        queryClient,
        // Chave do payload da aba do agente (SENSOR_KEYS.byAgent): o prefixo tem
        // de casar com a query real — ["agent-sensors", "agent", <id>].
        SENSOR_KEYS.byAgent(agentId),
        SENSORS_INVALIDATE_MIN_INTERVAL_MS,
      );
    };

    void (async () => {
      let connected = false;
      try {
        connected = await natsService.connect();
      } catch (error) {
        // Realtime é otimização: falha de conexão não pode afetar a página
        // (o polling de 30s continua como fallback).
        console.debug("[NATS][sensors] Falha ao conectar para tempo real:", error);
        return;
      }
      if (disposed || !connected) return;

      for (const subject of subjects) {
        if (!natsService.canSubscribeToSubject(subject)) {
          console.debug(
            "[NATS][sensors] Subject fora da allow-list do token, ignorando:",
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
  }, [agentId, enabled, queryClient, clientId, siteId]);
}
