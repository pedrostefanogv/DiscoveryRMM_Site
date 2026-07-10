import {
  Users,
  Monitor,
  Ticket,
  AlertTriangle,
  AppWindow,
  Server,
  Database,
  Activity,
  Cpu,
  CheckCircle2,
  XCircle,
  Clock,
  Zap,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { memo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useDashboardSummary } from '@/hooks/useDashboardSummary';
import { useP2POverview } from '@/hooks/useP2POverview';
import { StatCard, Card, CardHeader, Badge, SkeletonDashboard, ErrorDisplay } from '@/components/ui';
import { getRealtimeStats } from '@/api';
import { useSoftwareInventorySnapshot } from '@/hooks/useSoftwareInventory';
import { useTheme } from '@/theme/ThemeContext';
import type { DashboardWindow } from '@/api/dashboard';

function formatBytes(value?: number | null): string {
  if (!value || value <= 0) return '\u2014';
  const gb = value / (1024 ** 3);
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  const mb = value / (1024 ** 2);
  return `${mb.toFixed(0)} MB`;
}

function formatUptime(uptime?: string | number | null): string {
  if (uptime === null || uptime === undefined) return '\u2014';
  if (typeof uptime === 'string') return uptime;

  const totalSeconds = Math.max(0, Math.floor(uptime));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatMegabytes(value?: number | null): string {
  if (!value || value <= 0) return '\u2014';
  if (value >= 1024) return `${(value / 1024).toFixed(2)} GB`;
  return `${value.toFixed(2)} MB`;
}

const WINDOWS: { value: DashboardWindow; label: string }[] = [
  { value: '24h', label: 'Últimas 24h' },
  { value: '7d', label: 'Últimos 7 dias' },
  { value: '30d', label: 'Últimos 30 dias' },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const [window, setWindow] = useState<DashboardWindow>('24h');
  const { branding } = useTheme();

  const dashboard = useDashboardSummary('global', window);
  const softwareSnapshot = useSoftwareInventorySnapshot('global');
  const realtimeStats = useQuery({
    queryKey: ['realtime', 'stats'],
    queryFn: getRealtimeStats,
    refetchInterval: 300_000,
    refetchIntervalInBackground: true,
  });
  const p2pOverview = useP2POverview({ scope: 'global', window });

  const ds = dashboard.data;

  if (dashboard.isLoading && !ds) return <SkeletonDashboard />;
  if (dashboard.isError && !ds) {
    return (
      <ErrorDisplay
        message="Não foi possível comunicar com o servidor. Verifique se a API está online e tente novamente."
        onRetry={() => dashboard.refetch()}
      />
    );
  }
  const totalInstalledSoftware = softwareSnapshot.data?.totalInstalled ?? 0;
  const realtime = realtimeStats.data?.realtime;
  const database = realtimeStats.data?.database;
  const processMetrics = realtimeStats.data?.processMetrics;
  const threadPool = realtimeStats.data?.threadPool;
  const application = realtimeStats.data?.application;
  const uptimeValue = application?.uptime ?? application?.uptimeSeconds;
  const workingSet = processMetrics?.workingSetBytes
    ? formatBytes(processMetrics.workingSetBytes)
    : formatMegabytes(processMetrics?.workingSetMb);
  const gcHeap = processMetrics?.gcHeapBytes
    ? formatBytes(processMetrics.gcHeapBytes)
    : formatMegabytes(processMetrics?.gcManagedMemoryMb);
  const workerAvailable = threadPool?.workerAvailable ?? threadPool?.availableWorkers;
  const ioAvailable = threadPool?.ioAvailable ?? threadPool?.availableIo;
  const workerMin = threadPool?.workerMin ?? threadPool?.minWorkers;
  const ioMin = threadPool?.ioMin ?? threadPool?.minIo;

  // Dados do dashboard summary
  const agentsTotal = ds?.agents.total ?? 0;
  const agentsOnline = ds?.agents.online ?? 0;
  const agentsOffline = ds?.agents.offline ?? 0;
  const agentsStale = ds?.agents.stale ?? 0;
  const agentsMaintenance = ds?.agents.maintenance ?? 0;
  const agentsError = ds?.agents.error ?? 0;
  const ticketsOpen = ds?.tickets.open ?? 0;
  const ticketsSlaBreached = ds?.tickets.slaBreachedOpen ?? 0;
  const cmds = ds?.commands;
  const auto = ds?.automation;
  const logs = ds?.logs;
  const p2pKpis = p2pOverview.data?.kpis;

  return (
    <div className="space-y-6">
      {/* Header + Window Selector */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground inline-flex items-center gap-2">
            {branding.logoUrl ? (
              <img src={branding.logoUrl} alt="Logo" className="h-6 w-6 rounded" />
            ) : (
              <img src="/icon.ico" alt="Discovery RMM" className="h-6 w-6 rounded" />
            )}
            Dashboard
          </h1>
          <p className="text-sm text-muted">Visão geral do ambiente</p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-border bg-surface-light p-1">
          {WINDOWS.map(w => (
            <button
              key={w.value}
              type="button"
              onClick={() => setWindow(w.value)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                window === w.value
                  ? 'bg-primary/20 text-primary'
                  : 'text-muted hover:text-foreground'
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      {/* Linha 1 – KPIs principais */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <button
          type="button"
          onClick={() => navigate('/agents')}
          className="text-left"
          aria-label="Abrir página de agentes"
        >
          <StatCard
            icon={Monitor}
            label="Agentes"
            value={agentsTotal}
            tone="accent"
            trend={
              <span className="text-xs text-muted">
                {agentsOnline} online / {agentsOffline} offline
              </span>
            }
          />
        </button>
        <button
          type="button"
          onClick={() => navigate('/tickets')}
          className="text-left"
          aria-label="Abrir página de chamados"
        >
          <StatCard
            icon={Ticket}
            label="Chamados Abertos"
            value={ticketsOpen}
            tone="warning"
            trend={
              ticketsSlaBreached > 0 ? (
                <Badge color="danger">{ticketsSlaBreached} SLA</Badge>
              ) : (
                <span className="text-xs text-muted">{ds?.tickets.closed ?? 0} fechados</span>
              )
            }
          />
        </button>
        <button
          type="button"
          onClick={() => navigate('/software/inventory')}
          className="text-left"
          aria-label="Abrir inventário de softwares"
        >
          <StatCard
            icon={AppWindow}
            label="Softwares instalados"
            value={softwareSnapshot.isLoading ? '\u2014' : totalInstalledSoftware}
            tone="success"
          />
        </button>
        <button
          type="button"
          onClick={() => navigate('/clients')}
          className="text-left"
          aria-label="Abrir página de clientes"
        >
          <StatCard
            icon={Users}
            label="Clientes"
            value={realtimeStats.data?.business?.clients?.total ?? '\u2014'}
            tone="primary"
          />
        </button>
      </div>

      {/* Linha 2 – Saúde dos Agentes + Comandos */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Saúde dos Agentes"
            subtitle={`Distribuição de status • ${window}`}
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <StatusBar label="Online" value={agentsOnline} total={agentsTotal} color="text-success" bg="bg-success" />
            <StatusBar label="Offline" value={agentsOffline} total={agentsTotal} color="text-danger" bg="bg-danger" />
            <StatusBar label="Stale" value={agentsStale} total={agentsTotal} color="text-warning" bg="bg-warning" />
            <StatusBar label="Manutenção" value={agentsMaintenance} total={agentsTotal} color="text-primary" bg="bg-primary" />
          </div>
          {agentsError > 0 && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {agentsError} agente{agentsError !== 1 ? 's' : ''} em erro
            </div>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Comandos"
            subtitle={`Execuções na janela • ${window}`}
          />
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <MetricTile label="Pending" value={cmds?.pending ?? 0} icon={Clock} />
            <MetricTile label="Running" value={cmds?.running ?? 0} icon={Activity} />
            <MetricTile label="Completed" value={cmds?.completed ?? 0} icon={CheckCircle2} />
            <MetricTile label="Failed" value={cmds?.failed ?? 0} icon={XCircle} />
            <MetricTile label="Total" value={cmds?.total ?? 0} icon={Cpu} />
            <div className="rounded-lg bg-surface-light px-3 py-2 text-sm">
              <div className="flex items-center gap-1.5 text-muted">
                <Zap className="h-3.5 w-3.5" />
                <span>Sucesso</span>
              </div>
              <p className={`mt-1 text-base font-semibold ${(cmds?.successRate ?? 0) >= 80 ? 'text-success' : 'text-danger'}`}>
                {cmds?.total ? `${cmds.successRate.toFixed(1)}%` : '\u2014'}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Linha 3 – Automação + Logs */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Automação"
            subtitle={`Execuções na janela • ${window}`}
          />
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <MetricTile label="Dispatched" value={auto?.dispatched ?? 0} icon={Zap} />
            <MetricTile label="Acknowledged" value={auto?.acknowledged ?? 0} icon={Activity} />
            <MetricTile label="Completed" value={auto?.completed ?? 0} icon={CheckCircle2} />
            <MetricTile label="Failed" value={auto?.failed ?? 0} icon={XCircle} />
            <MetricTile label="Total" value={auto?.total ?? 0} icon={Cpu} />
            <div className="rounded-lg bg-surface-light px-3 py-2 text-sm">
              <div className="flex items-center gap-1.5 text-muted">
                <Zap className="h-3.5 w-3.5" />
                <span>Sucesso</span>
              </div>
              <p className={`mt-1 text-base font-semibold ${(auto?.successRate ?? 0) >= 80 ? 'text-success' : 'text-danger'}`}>
                {auto?.total ? `${auto.successRate.toFixed(1)}%` : '\u2014'}
              </p>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Distribuição de Logs"
            subtitle={`Entradas na janela • ${window}`}
          />
          <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-lg bg-danger/10 px-3 py-2">
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-danger" />
                <span className="text-muted">Erros</span>
              </div>
              <p className="mt-1 text-2xl font-bold text-foreground">{logs?.error ?? 0}</p>
            </div>
            <div className="rounded-lg bg-warning/10 px-3 py-2">
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                <span className="text-muted">Avisos</span>
              </div>
              <p className="mt-1 text-2xl font-bold text-foreground">{logs?.warn ?? 0}</p>
            </div>
            <div className="rounded-lg bg-surface-light px-3 py-2">
              <div className="flex items-center gap-1.5 text-muted">
                <Activity className="h-3.5 w-3.5" />
                <span>Info</span>
              </div>
              <p className="mt-1 text-2xl font-bold text-foreground">{logs?.info ?? 0}</p>
            </div>
            <div className="rounded-lg bg-surface-light px-3 py-2">
              <div className="flex items-center gap-1.5 text-muted">
                <Database className="h-3.5 w-3.5" />
                <span>Total</span>
              </div>
              <p className="mt-1 text-2xl font-bold text-foreground">{logs?.total ?? 0}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Linha 4 – Saúde da Plataforma + Métricas do Processo */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Saúde da Plataforma"
            subtitle="Conectividade em tempo real e infraestrutura"
          />
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between rounded-lg bg-surface-light px-3 py-2">
              <span className="flex items-center gap-2 text-muted-foreground">
                <Activity className="h-4 w-4" /> NATS
              </span>
              <div className="flex items-center gap-2">
                <Badge color={realtime?.natsConnected ? 'success' : 'danger'}>
                  {realtime?.natsConnected ? 'Conectado' : 'Desconectado'}
                </Badge>
                {realtime?.natsConnectionState && (
                  <span className="text-xs text-muted">{realtime.natsConnectionState}</span>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg bg-surface-light px-3 py-2">
              <span className="flex items-center gap-2 text-muted-foreground">
                <Database className="h-4 w-4" /> Redis
              </span>
              <div className="flex items-center gap-2">
                <Badge color={realtime?.redisConnected ? 'success' : 'danger'}>
                  {realtime?.redisConnected ? 'Conectado' : 'Desconectado'}
                </Badge>
                {typeof realtime?.redisPingMs === 'number' && (
                  <span className="text-xs text-muted">{realtime.redisPingMs} ms</span>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg bg-surface-light px-3 py-2">
              <span className="flex items-center gap-2 text-muted-foreground">
                <Server className="h-4 w-4" /> Banco de dados
              </span>
              <div className="flex items-center gap-2">
                <Badge color={database?.connected ? 'success' : 'danger'}>
                  {database?.connected ? 'Conectado' : 'Desconectado'}
                </Badge>
                {database?.provider && (
                  <span className="text-xs text-muted">{database.provider}</span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1 text-xs text-muted">
              <div className="rounded-lg bg-surface-light px-3 py-2">
                <p className="text-muted">Realtime agents</p>
                <p className="mt-0.5 text-sm font-semibold text-foreground">
                  {realtime?.realtimeConnectedAgents ?? realtime?.signalrConnectedAgents ?? 0}
                </p>
              </div>
              <div className="rounded-lg bg-surface-light px-3 py-2">
                <p className="text-muted">NATS TCP</p>
                <p className="mt-0.5 text-sm font-semibold text-foreground">
                  {realtime?.natsTcpReachable ? 'Reachable' : 'Unreachable'}
                </p>
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Métricas do Processo"
            subtitle={application?.environment
              ? `${application.environment} • ${application.machineName ?? 'host'}`
              : 'Uso de recursos do backend'}
          />
          <div className="grid grid-cols-2 gap-3 text-sm">
            <MetricTile label="Working Set" value={workingSet} icon={Cpu} />
            <MetricTile label="GC Heap" value={gcHeap} icon={Database} />
            <MetricTile label="Threads" value={processMetrics?.threadCount ?? '\u2014'} icon={Activity} />
            <MetricTile label="Uptime" value={formatUptime(uptimeValue)} icon={Server} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted">
            <div className="rounded-lg bg-surface-light px-3 py-2">
              <p className="text-muted">ThreadPool worker</p>
              <p className="mt-0.5 text-sm font-semibold text-foreground">
                {workerAvailable ?? '\u2014'} disp / {workerMin ?? '\u2014'} min
              </p>
            </div>
            <div className="rounded-lg bg-surface-light px-3 py-2">
              <p className="text-muted">ThreadPool IO</p>
              <p className="mt-0.5 text-sm font-semibold text-foreground">
                {ioAvailable ?? '\u2014'} disp / {ioMin ?? '\u2014'} min
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Linha 6 – P2P Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Monitor} label="Agentes ativos P2P" value={p2pKpis?.activeAgents ?? '\u2014'} tone="accent" />
        <StatCard icon={Server} label="Seeders ativos" value={p2pKpis?.activeSeeders ?? '\u2014'} tone="primary" />
        <StatCard icon={CheckCircle2} label="Success rate" value={typeof p2pKpis?.replicationSuccessRate === 'number' ? `${p2pKpis.replicationSuccessRate.toFixed(1)}%` : '\u2014'} tone="success" />
        <StatCard icon={Database} label="Bytes servidos" value={formatBytes(p2pKpis?.bytesServedDelta)} tone="warning" />
      </div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

// tone maps the bg-* prop to a CSS class suffix (e.g. "bg-success" → "success")
const BG_TO_TONE: Record<string, string> = {
  'bg-success': 'success',
  'bg-danger': 'danger',
  'bg-warning': 'warning',
  'bg-primary': 'primary',
};

const StatusBar = memo(function StatusBar({
  label,
  value,
  total,
  color,
  bg,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
  bg: string;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  const tone = BG_TO_TONE[bg] ?? 'primary';
  return (
    <div className="rounded-lg bg-surface-light px-3 py-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted">{label}</span>
        <span className={`font-semibold ${color}`}>{value}</span>
      </div>
      <progress
        value={pct}
        max={100}
        className={`status-bar status-bar-${tone} mt-1.5`}
        aria-label={`${label}: ${value} de ${total}`}
      />
    </div>
  );
});

const MetricTile = memo(function MetricTile({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-lg bg-surface-light px-3 py-2">
      <div className="flex items-center gap-1.5 text-muted">
        <Icon className="h-3.5 w-3.5" />
        <span>{label}</span>
      </div>
      <p className="mt-1 text-base font-semibold text-foreground">{value}</p>
    </div>
  );
});
