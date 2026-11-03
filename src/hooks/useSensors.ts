import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sensorsApi } from "@/api/sensors";
import type {
  SensorEventsParams,
  SensorFleetSummaryParams,
  SensorListParams,
  SensorSeriesParams,
  SensorUpsertRequest,
} from "@/api";

/**
 * Chaves de cache da aba "Sensores". Um prefixo único ("agent-sensors") permite
 * invalidar tudo — payload da aba, definições, séries e eventos — de uma vez
 * depois de criar/editar/excluir/executar, sem caçar cada chave.
 */
export const SENSOR_KEYS = {
  all: ["agent-sensors"] as const,
  byAgent: (agentId: string) => [...SENSOR_KEYS.all, "agent", agentId] as const,
  definitions: (params: SensorListParams) => [...SENSOR_KEYS.all, "definitions", params] as const,
  series: (agentId: string, sensorId: string, params: SensorSeriesParams) =>
    [...SENSOR_KEYS.all, "series", agentId, sensorId, params] as const,
  events: (agentId: string, sensorId: string, params: SensorEventsParams) =>
    [...SENSOR_KEYS.all, "events", agentId, sensorId, params] as const,
  fleetSummary: (params: SensorFleetSummaryParams) =>
    [...SENSOR_KEYS.all, "fleet-summary", params] as const,
};

/**
 * Payload da aba "Sensores" de um agente.
 *
 * `enabled` existe porque o hook fica SEMPRE montado no detalhe do agente
 * (regras de hooks) e só deve buscar quando a aba está ativa e o usuário tem
 * Sensors.View. Com a aba aberta, o polling de 30s mantém os estados frescos sem
 * depender de realtime — cada sensor tem o seu próprio intervalo de coleta.
 */
export function useAgentSensors(agentId: string, enabled = true) {
  return useQuery({
    queryKey: SENSOR_KEYS.byAgent(agentId),
    queryFn: () => sensorsApi.agentSensors(agentId),
    enabled: Boolean(agentId) && enabled,
    staleTime: 30_000,
    refetchInterval: enabled ? 30_000 : false,
  });
}

/**
 * Agregados da frota de sensores (página "Sensores").
 *
 * O resumo percorre todos os estados de sensores visíveis para o usuário, então
 * é uma consulta mais cara que a da aba do agente: staleTime de 1 min e sem
 * polling — quem quiser frescor usa o botão "Atualizar" (ou o realtime da aba).
 */
export function useSensorsFleetSummary(
  params: SensorFleetSummaryParams = {},
  enabled = true,
) {
  return useQuery({
    queryKey: SENSOR_KEYS.fleetSummary(params),
    queryFn: () => sensorsApi.fleetSummary(params),
    enabled,
    staleTime: 60_000,
  });
}

/** Definições de sensor (edição) — buscadas sob demanda pelo formulário. */
export function useSensorDefinitions(params: SensorListParams = {}, enabled = true) {
  return useQuery({
    queryKey: SENSOR_KEYS.definitions(params),
    queryFn: () => sensorsApi.listDefinitions(params),
    enabled,
    staleTime: 30_000,
  });
}

/** Histórico de eventos de um sensor (modal "Histórico"). */
export function useSensorEvents(
  agentId: string,
  sensorId: string,
  params: SensorEventsParams = {},
  enabled = true,
) {
  return useQuery({
    queryKey: SENSOR_KEYS.events(agentId, sensorId, params),
    queryFn: () => sensorsApi.events(agentId, sensorId, params),
    enabled: Boolean(agentId) && Boolean(sensorId) && enabled,
    staleTime: 15_000,
  });
}

/** Executa a coleta agora (todos os sensores ou uma seleção). */
export function useRunSensors() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, sensorIds }: { agentId: string; sensorIds?: string[] }) =>
      sensorsApi.run(agentId, sensorIds),
    onSuccess: () => qc.invalidateQueries({ queryKey: SENSOR_KEYS.all }),
  });
}

/** Zera o estado de um sensor (o agent não é acionado). */
export function useResetSensorState() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, sensorId }: { agentId: string; sensorId: string }) =>
      sensorsApi.resetState(agentId, sensorId),
    onSuccess: () => qc.invalidateQueries({ queryKey: SENSOR_KEYS.all }),
  });
}

/** Pede ao agent para re-sincronizar a policy de sensores agora. */
export function useSyncSensorsNow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId }: { agentId: string }) => sensorsApi.syncNow(agentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: SENSOR_KEYS.all }),
  });
}

export function useCreateSensor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: SensorUpsertRequest) => sensorsApi.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: SENSOR_KEYS.all }),
  });
}

export function useUpdateSensor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: SensorUpsertRequest }) =>
      sensorsApi.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: SENSOR_KEYS.all }),
  });
}

export function useDeleteSensor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sensorId }: { sensorId: string }) => sensorsApi.remove(sensorId),
    onSuccess: () => qc.invalidateQueries({ queryKey: SENSOR_KEYS.all }),
  });
}
