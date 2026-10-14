import { HardDrive, RefreshCw, ShieldCheck, TriangleAlert } from 'lucide-react';
import { useObjectStorageTelemetry } from '@/hooks/useObjectStorageTelemetry';
import { useNowTick } from '@/hooks/useNowTick';
import { Badge, Button, Card, CardHeader, Skeleton } from '@/components/ui';
import type { ObjectStorageTelemetryDto } from '@/api/object-storage';

/**
 * Card de Object Storage (S3).
 *
 * O backend garante que este card NAO sobrecarrega a API do storage:
 * - metricas passivas (contadores locais, zero chamadas ao S3);
 * - probe ativo de 1 HEAD bucket, cacheado com single-flight + circuit breaker;
 * - nenhuma listagem/varredura no caminho da request.
 *
 * Estado de saude tem 3 valores: "nao verificado" nunca e renderizado como
 * "inacessivel" (mesma classe de bug corrigida no card de NATS).
 */

type HealthState = 'unknown' | 'up' | 'down';

function resolveHealth(data?: ObjectStorageTelemetryDto): HealthState {
  if (!data || !data.configured) return 'unknown';
  if (data.reachable === true) return 'up';
  if (data.reachable === false) return 'down';
  return 'unknown';
}

const HEALTH_BADGE: Record<HealthState, { color: 'success' | 'danger' | 'slate'; label: string }> = {
  up: { color: 'success', label: 'Acessível' },
  down: { color: 'danger', label: 'Inacessível' },
  unknown: { color: 'slate', label: 'Não verificado' },
};

function formatBytes(value?: number | null): string {
  if (value == null) return '—';
  // 0 e um valor observavel (nenhuma transferencia), nao "sem dado".
  if (value <= 0) return '0 B';
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(2)} GB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(0)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(0)} KB`;
  return `${value} B`;
}

function formatPercent(value?: number | null): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return `${value.toFixed(1)}%`;
}

function formatDateTime(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function relativeSeconds(fromIso: string | null | undefined, now: number): string | null {
  if (!fromIso) return null;
  const from = new Date(fromIso).getTime();
  if (Number.isNaN(from)) return null;
  const seconds = Math.max(0, Math.round((now - from) / 1000));
  if (seconds < 60) return `há ${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `há ${minutes} min`;
  return `há ${Math.round(minutes / 60)} h`;
}

function modeLabel(mode: string): string {
  if (mode === 'internal') return 'Interno (RustFS)';
  if (mode === 'external') return 'Externo (S3-compatível)';
  return 'Não configurado';
}

function tile(label: string, value: string, tone = 'text-foreground') {
  return (
    <div className="rounded-lg bg-surface-light px-3 py-2">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-sm font-semibold ${tone}`}>{value}</p>
    </div>
  );
}

export function ObjectStorageCard() {
  const overview = useObjectStorageTelemetry();
  const now = useNowTick();
  const data = overview.data;
  const health = resolveHealth(data);
  const badge = HEALTH_BADGE[health];
  const traffic = data?.traffic;
  const checkedAgo = relativeSeconds(data?.checkedAtUtc, now);
  const probeWindow = data?.checkedAtUtc && data?.nextCheckAfterUtc
    ? Math.max(1, Math.round((new Date(data.nextCheckAfterUtc).getTime() - new Date(data.checkedAtUtc).getTime()) / 60000))
    : null;

  return (
    <Card>
      <CardHeader
        title="Object Storage (S3)"
        subtitle="Bucket, saúde e tráfego • verificação sem listagem"
        action={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void overview.refetch()}
            loading={overview.isFetching}
          >
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </Button>
        }
      />

      {overview.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} variant="rectangular" height="54px" />
          ))}
        </div>
      ) : overview.isError || !data ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg bg-surface-light px-4 py-6 text-center">
          <HardDrive className="h-6 w-6 text-danger" />
          <p className="text-sm font-medium text-muted-foreground">Não foi possível carregar a telemetria do storage</p>
          <p className="max-w-md text-xs text-muted">Verifique a conexão com a API e tente novamente.</p>
          <Button variant="secondary" size="sm" onClick={() => void overview.refetch()}>Tentar novamente</Button>
        </div>
      ) : !data.configured ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg bg-surface-light px-4 py-6 text-center">
          <HardDrive className="h-6 w-6 text-warning" />
          <p className="text-sm font-medium text-muted-foreground">Object storage não configurado</p>
          <p className="max-w-md text-xs text-muted">
            Configure bucket, endpoint e credenciais em Configurações → Servidor para habilitar o storage de objetos.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge color={badge.color}>{badge.label}</Badge>
            <Badge color="slate">{modeLabel(data.mode)}</Badge>
            {data.throttled && (
              <Badge color="warning">
                <TriangleAlert className="mr-1 h-3 w-3" aria-hidden="true" />
                Circuit breaker aberto ({data.consecutiveFailures} falha{data.consecutiveFailures !== 1 ? 's' : ''})
              </Badge>
            )}
            {data.latencyMs != null && (
              <span className="text-xs text-muted">{data.latencyMs} ms (HEAD bucket)</span>
            )}
            {checkedAgo && <span className="text-xs text-muted">verificado {checkedAgo}</span>}
            {!checkedAgo && <span className="text-xs text-muted">verificação pendente</span>}
          </div>

          <div className="grid gap-2 text-xs text-muted sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-lg bg-surface-light px-3 py-2">
              <p className="text-muted">Bucket</p>
              <p className="mt-0.5 truncate text-sm font-semibold text-foreground">{data.bucket ?? '—'}</p>
            </div>
            <div className="rounded-lg bg-surface-light px-3 py-2">
              <p className="text-muted">Endpoint</p>
              <p className="mt-0.5 truncate text-sm font-semibold text-foreground">{data.endpointHost ?? '—'}</p>
            </div>
            <div className="rounded-lg bg-surface-light px-3 py-2">
              <p className="text-muted">Região</p>
              <p className="mt-0.5 truncate text-sm font-semibold text-foreground">{data.region ?? '—'}</p>
            </div>
            <div className="rounded-lg bg-surface-light px-3 py-2">
              <p className="text-muted">Path-style</p>
              <p className="mt-0.5 text-sm font-semibold text-foreground">{data.usePathStyle ? 'Sim' : 'Não'}</p>
            </div>
            <div className="rounded-lg bg-surface-light px-3 py-2">
              <p className="text-muted">Verificar SSL</p>
              <p className="mt-0.5 text-sm font-semibold text-foreground">{data.sslVerify ? 'Sim' : 'Não'}</p>
            </div>
            <div className="rounded-lg bg-surface-light px-3 py-2">
              <p className="text-muted">TTL de URL pré-assinada</p>
              <p className="mt-0.5 text-sm font-semibold text-foreground">{data.presignTtlHours}h</p>
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center gap-2 text-xs text-muted">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span className="font-medium">Tráfego observado (métricas passivas, sem chamadas extras ao S3)</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {tile('Uploads', String(traffic?.uploads ?? 0))}
              {tile('Downloads', String(traffic?.downloads ?? 0))}
              {tile('URLs pré-assinadas', String(traffic?.presigns ?? 0))}
              {tile('Em andamento', String(traffic?.inFlight ?? 0))}
              {tile('Bytes enviados', formatBytes(traffic?.bytesIn))}
              {tile('Bytes baixados', formatBytes(traffic?.bytesOut))}
              {tile(
                'Taxa de erro',
                formatPercent(traffic?.errorRate),
                (traffic?.errorRate ?? 0) > 0 ? 'text-danger' : 'text-success',
              )}
              {tile('Latência p95', traffic ? `${traffic.p95LatencyMs.toFixed(0)} ms` : '—')}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <HardDrive className="h-3.5 w-3.5" />
              {probeWindow
                ? `Probe ativo: 1 HEAD de bucket a cada ~${probeWindow} min; nenhuma listagem é executada.`
                : 'Probe ativo cacheado; nenhuma listagem é executada.'}
            </span>
            <span>
              {data.usageScanEnabled
                ? 'Inventário de uso (ListObjects) habilitado.'
                : 'Inventário de uso (ListObjects) desativado — evita varredura no bucket.'}
            </span>
            {data.generatedAtUtc && <span>Última leitura: {formatDateTime(data.generatedAtUtc)}</span>}
          </div>

          {(data.errors?.length ?? 0) > 0 && (
            <div className="rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">
              <p className="font-medium">Último erro no probe:</p>
              <p className="mt-0.5 break-words">{data.errors[0]}</p>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
