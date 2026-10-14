import { api, type ApiRequestInit } from "./client";

/** Modo efetivo do object storage no servidor. */
export type ObjectStorageMode = "internal" | "external" | "not_configured";

/**
 * Metricas PASSIVAS: contadores das operacoes que a aplicacao ja executou.
 * Nao representam nenhuma chamada adicional ao S3.
 */
export interface ObjectStorageTrafficDto {
  sinceUtc: string;
  uploads: number;
  downloads: number;
  presigns: number;
  heads: number;
  deletes: number;
  bytesIn: number;
  bytesOut: number;
  operations: number;
  failures: number;
  errorRate: number;
  p95LatencyMs: number;
  maxLatencyMs: number;
  inFlight: number;
  lastSuccessAtUtc?: string | null;
  lastFailureAtUtc?: string | null;
  lastError?: string | null;
}

export interface ObjectStorageTelemetryDto {
  configured: boolean;
  mode: ObjectStorageMode | string;
  provider: string;
  endpointHost?: string | null;
  bucket?: string | null;
  region?: string | null;
  usePathStyle: boolean;
  sslVerify: boolean;
  presignTtlHours: number;
  /** null/ausente = nao verificado (nunca interpretar como "fora do ar"). */
  reachable?: boolean | null;
  bucketReachable?: boolean | null;
  latencyMs?: number | null;
  configurationValid: boolean;
  checkedAtUtc?: string | null;
  nextCheckAfterUtc?: string | null;
  /** Circuit breaker aberto: o backend esta espacando os probes. */
  throttled: boolean;
  consecutiveFailures: number;
  errors: string[];
  /** Varredura de uso (ListObjects) — desligada por padrao no backend. */
  usageScanEnabled: boolean;
  traffic: ObjectStorageTrafficDto;
  generatedAtUtc: string;
}

export const objectStorageApi = {
  /**
   * Telemetria do storage. O backend responde do cache: com o cache quente
   * NENHUMA chamada e feita ao S3 (nem HEAD, nem listagem).
   */
  getTelemetry: (init?: ApiRequestInit) =>
    api.get<ObjectStorageTelemetryDto>(
      "/api/v1/ops/object-storage/telemetry",
      {},
      init,
    ),
};
