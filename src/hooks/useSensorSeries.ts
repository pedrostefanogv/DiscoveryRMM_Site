import { useQuery } from "@tanstack/react-query";
import { sensorsApi } from "@/api/sensors";
import type { SensorSeriesParams } from "@/api";
import { SENSOR_KEYS } from "./useSensors";

/**
 * Série temporal de um sensor para o gráfico (janela escolhida no modal).
 *
 * A chave inclui from/to/canais/alvo: trocar a faixa (1h → 7d) é outra consulta,
 * e voltar para uma faixa já vista reaproveita o cache. Série de janela fechada
 * é imutável para a UI, por isso staleTime maior que o do payload da aba.
 */
export function useSensorSeries(
  agentId: string,
  sensorId: string,
  params: SensorSeriesParams,
  enabled = true,
) {
  return useQuery({
    queryKey: SENSOR_KEYS.series(agentId, sensorId, params),
    queryFn: () => sensorsApi.series(agentId, sensorId, params),
    enabled:
      Boolean(agentId) &&
      Boolean(sensorId) &&
      enabled &&
      Boolean(params.from) &&
      Boolean(params.to),
    staleTime: 60_000,
    placeholderData: (previous) => previous,
  });
}
