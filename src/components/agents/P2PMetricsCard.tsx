import { Activity, Database, Download, Gauge, Network, Server, ShieldCheck, Upload } from 'lucide-react';
import { useP2POverview } from '@/hooks/useP2POverview';
import { Card, CardHeader, Badge } from '@/components/ui';

type BadgeColor = 'primary' | 'success' | 'warning' | 'danger' | 'slate' | 'accent';

function formatBytes(value?: number | null): string {
  if (!value || value <= 0) return '\u2014';
  const gb = value / (1024 ** 3);
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  const mb = value / (1024 ** 2);
  return `${mb.toFixed(0)} MB`;
}

function formatNumber(value?: number | null): string {
  if (value == null) return '\u2014';
  return new Intl.NumberFormat('pt-BR').format(value);
}

function healthBadge(health?: string): BadgeColor {
  switch (health) {
    case 'Healthy': return 'success';
    case 'Warning': return 'warning';
    case 'Unhealthy': return 'danger';
    default: return 'slate';
  }
}

function kpiCard(
  icon: React.ReactNode,
  label: string,
  value: React.ReactNode,
  tone: 'slate' | 'primary' | 'success' | 'warning' | 'danger' | 'accent' = 'slate',
) {
  return (
    <div className="rounded-lg bg-surface-light px-3 py-2">
      <div className="flex items-center gap-1.5 text-xs text-muted">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <p className={`mt-1 text-sm font-medium ${tone === 'success' ? 'text-success' : tone === 'warning' ? 'text-warning' : tone === 'danger' ? 'text-danger' : tone === 'primary' ? 'text-primary' : tone === 'accent' ? 'text-accent' : 'text-foreground'}`}>
        {value}
      </p>
    </div>
  );
}

export function P2PMetricsCard() {
  const overview = useP2POverview({ scope: 'global', window: '24h' });
  const kpis = overview.data?.kpis;

  return (
    <Card>
      <CardHeader
        title="Métricas P2P"
        subtitle="Distribuição de artefatos entre agentes (janela 24h)"
      />
      {overview.isLoading ? (
        <p className="text-sm text-muted">Carregando métricas P2P...</p>
      ) : overview.isError || !overview.data ? (
        <p className="text-sm text-muted">Sem telemetria P2P disponível neste período.</p>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
            {kpiCard(<Server className="h-3.5 w-3.5" />, 'Agentes ativos', formatNumber(kpis?.activeAgents), 'accent')}
            {kpiCard(<ShieldCheck className="h-3.5 w-3.5" />, 'Seeders ativos', formatNumber(kpis?.activeSeeders), 'primary')}
            {kpiCard(<Gauge className="h-3.5 w-3.5" />, 'Success rate', typeof kpis?.replicationSuccessRate === 'number' ? `${kpis.replicationSuccessRate.toFixed(1)}%` : '\u2014', 'success')}
            {kpiCard(<Upload className="h-3.5 w-3.5" />, 'Bytes servidos', formatBytes(kpis?.bytesServedDelta), 'warning')}
            {kpiCard(<Download className="h-3.5 w-3.5" />, 'Bytes baixados', formatBytes(kpis?.bytesDownloadedDelta), 'primary')}
            {kpiCard(<Database className="h-3.5 w-3.5" />, 'Artefatos com peers', formatNumber(kpis?.artifactsWithPeers), 'accent')}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
            <div className="flex items-center gap-2">
              <Network className="h-3.5 w-3.5 text-muted" />
              <span className="text-xs text-muted">Pressão de fila</span>
              <span className="text-sm font-medium text-foreground">{formatNumber(kpis?.queuePressure)}</span>
            </div>
            <div className="flex items-center gap-2">
              <Activity className="h-3.5 w-3.5 text-muted" />
              <span className="text-xs text-muted">Saúde da rede</span>
              <Badge color={healthBadge(overview.data.health)}>{overview.data.health || '\u2014'}</Badge>
            </div>
            {kpis?.lastTelemetryAtUtc && (
              <span className="text-xs text-muted">
                Última telemetria: {new Date(kpis.lastTelemetryAtUtc).toLocaleString('pt-BR')}
              </span>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
