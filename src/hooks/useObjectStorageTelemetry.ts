import { useQuery } from "@tanstack/react-query";
import {
  objectStorageApi,
  type ObjectStorageTelemetryDto,
} from "@/api/object-storage";

/**
 * Telemetria do object storage (S3).
 *
 * O backend sofre para nao sobrecarregar a API do storage: o probe ativo e
 * cacheado no servidor (TTL + single-flight + circuit breaker). Por isso o
 * refetch aqui e >= 5min e NUNCA entra no refresh global do dashboard.
 */
const STALE_MS = 60_000;
const REFETCH_MS = 300_000;

export function useObjectStorageTelemetry(enabled = true) {
  return useQuery<ObjectStorageTelemetryDto>({
    queryKey: ["object-storage", "telemetry"],
    queryFn: ({ signal }) => objectStorageApi.getTelemetry({ signal }),
    enabled,
    staleTime: STALE_MS,
    refetchInterval: REFETCH_MS,
    refetchIntervalInBackground: false,
  });
}
