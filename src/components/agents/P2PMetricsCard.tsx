import {
  Activity,
  CheckCircle2,
  Database,
  Download,
  Gauge,
  Network,
  RefreshCw,
  Server,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { useP2POverview } from '@/hooks/useP2POverview';
import { Badge, Button, Card, CardHeader, Skeleton } from '@/components/ui';
import type { P2PScope } from '@/api/p2p';
import type { DashboardWindow } from '@/api/dashboard';

type Tone = 'slate' | 'primary' | 'success' | 'warning' | 'danger' | 'accent';
type BadgeColor = Tone;

const WINDOW_HOURS: Record<DashboardWindow, number> = {
  '24h': 24,
  '7d': 168,
  '30d': 720,
};

function formatBytes(value?: number | null): string {
  if (value == null) return '\u2014';
  // 0 é um valor observável (nenhuma transferência na janela), não "sem dado".
  if (value <= 0) return '0 B';
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(2)} GB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(0)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(0)} KB`;
  return `${value} B`;
}

function formatNumber(value?: number | null): string {
  if (value == null) return '\u2014';
  return new Intl.NumberFormat('pt-BR').format(value);
}

function formatPercent(value?: number | null): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '\u2014';
  return `${value.toFixed(1)}%`;
}

// O backend devolve health em minúsculas ("ok"/"warning"/"critical"); o estado
// "nodata" indica ausência de telemetria na janela.
function healthMeta(health?: string): { color: BadgeColor; label: string } {
  switch ((health ?? '').toLowerCase()) {
    case 'healthy':
    case 'ok':
      return { color: 'success', label: 'Saudável' };
    case 'warning':
      return { color: 'warning', label: 'Atenção' };
    case 'unhealthy':
    case 'critical':
      return { color: 'danger', label: 'Crítico' };
    default:
      return { color: 'slate', label: 'Sem dados' };
  }
}

function toneClass(tone: Tone): string {
  switch (tone) {
    case 'success': return 'text-success';
    case 'warning': return 'text-warning';
    case 'danger': return 'text-danger';
    case 'primary': return 'text-primary';
    case 'accent': return 'text-accent';
    default: return 'text-foreground';
  }
}

function kpiCard(
  icon: React.ReactNode,
  label: string,
  value: React.ReactNode,
  tone: Tone = 'slate',
) {
  return (
    <div className="rounded-lg bg-surface-light px-3 py-2">
      <div className="flex items-center gap-1.5 text-xs text-muted">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <p className={`mt-1 text-sm font-medium ${toneClass(tone)}`}>{value}</p>
    </div>
  );
}

interface P2PMetricsCardProps {
  scope?: P2PScope;
  window?: DashboardWindow;
}

export function P2PMetricsCard({ scope = 'global', window = '24h' }: P2PMetricsCardProps) {
  const overview = useP2POverview({ scope, windowHours: WINDOW_HOURS[window] });
  const kpis = overview.data?.kpis;

  const windowLabel = overview.data?.window ?? window;
  const hasTelemetry = Boolean(kpis?.lastTelemetryAtUtc);
  const replicationsStarted = kpis?.replicationsStartedDelta ?? 0;
  const health = healthMeta(overview.data?.health);
  const lastTelemetry = kpis?.lastTelemetryAtUtc
    ? new Date(kpis.lastTelemetryAtUtc).toLocaleString('pt-BR')
    : null;

  const retryButton = (
    <Button variant="secondary" size="sm" onClick={() => void overview.refetch()}>
      Tentar novamente
    </Button>
  );

  return (
    <Card>
      <CardHeader
        title="Métricas P2P"
        subtitle={`Distribuição de artefatos entre agentes (janela ${windowLabel})`}
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
      ) : overview.isError || !overview.data ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg bg-surface-light px-4 py-6 text-center">
          <Network className="h-6 w-6 text-danger" />
          <p className="text-sm font-medium text-muted-foreground">
            Não foi possível carregar as métricas P2P
          </p>
          <p className="max-w-md text-xs text-muted">
            Verifique a conexão com a API e tente novamente.
          </p>
          {retryButton}
        </div>
      ) : !hasTelemetry ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg bg-surface-light px-4 py-6 text-center">
          <Network className="h-6 w-6 text-muted" />
          <p className="text-sm font-medium text-muted-foreground">
            Sem telemetria P2P nesta janela
          </p>
          <p className="max-w-md text-xs text-muted">
            Nenhum agente reportou métricas no período. Confirme se o P2P está habilitado e se os
            agentes estão enviando telemetria.
          </p>
          {retryButton}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {kpiCard(<Server className="h-3.5 w-3.5" />, 'Agentes ativos', formatNumber(kpis?.activeAgents), 'accent')}
            {kpiCard(<ShieldCheck className="h-3.5 w-3.5" />, 'Seeders ativos', formatNumber(kpis?.activeSeeders), 'primary')}
            {kpiCard(
              <Gauge className="h-3.5 w-3.5" />,
              'Success rate',
              replicationsStarted > 0 ? formatPercent(kpis?.replicationSuccessRate) : '\u2014',
              'success',
            )}
            {/* Presença tem TTL fixo de 2h no servidor (independente da janela). */}
            {kpiCard(<Database className="h-3.5 w-3.5" />, 'Artefatos com peers (2h)', formatNumber(kpis?.artifactsWithPeers), 'accent')}
            {kpiCard(<Activity className="h-3.5 w-3.5" />, 'Replicações iniciadas', formatNumber(kpis?.replicationsStartedDelta), 'slate')}
            {kpiCard(<CheckCircle2 className="h-3.5 w-3.5" />, 'Replicações concluídas', formatNumber(kpis?.replicationsSucceededDelta), 'success')}
            {kpiCard(<Upload className="h-3.5 w-3.5" />, 'Bytes servidos', formatBytes(kpis?.bytesServedDelta), 'warning')}
            {kpiCard(<Download className="h-3.5 w-3.5" />, 'Bytes baixados', formatBytes(kpis?.bytesDownloadedDelta), 'primary')}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
            <div className="flex items-center gap-2">
              <Network className="h-3.5 w-3.5 text-muted" />
              <span className="text-xs text-muted">Pressão de fila</span>
              <span className="text-sm font-medium text-foreground">
                {typeof kpis?.queuePressure === 'number' ? formatPercent(kpis.queuePressure * 100) : '\u2014'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Activity className="h-3.5 w-3.5 text-muted" />
              <span className="text-xs text-muted">Saúde da rede</span>
              <Badge color={health.color}>{health.label}</Badge>
            </div>
            {lastTelemetry && (
              <span className="text-xs text-muted">Última telemetria: {lastTelemetry}</span>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
