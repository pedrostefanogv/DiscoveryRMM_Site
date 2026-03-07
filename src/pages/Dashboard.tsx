import {
  Users,
  Monitor,
  Ticket,
  AlertTriangle,
  WifiOff,
  AppWindow,
  Server,
  Database,
  Activity,
  Cpu,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useClients } from '@/hooks/useClients';
import { useTickets } from '@/hooks/useTickets';
import { useLogs } from '@/hooks/useLogs';
import { StatCard, Card, CardHeader, Badge } from '@/components/ui';
import { Loading, ErrorDisplay } from '@/components/ui';
import { agentsApi, LogLevel, getRealtimeStats, type TicketPriority } from '@/api';
import { useSoftwareInventorySnapshot } from '@/hooks/useSoftwareInventory';

function formatBytes(value?: number | null): string {
  if (!value || value <= 0) return '—';
  const gb = value / (1024 ** 3);
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  const mb = value / (1024 ** 2);
  return `${mb.toFixed(0)} MB`;
}

function formatUptime(uptime?: string | number | null): string {
  if (uptime === null || uptime === undefined) return '—';
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
  if (!value || value <= 0) return '—';
  if (value >= 1024) return `${(value / 1024).toFixed(2)} GB`;
  return `${value.toFixed(2)} MB`;
}

export default function Dashboard() {
  const navigate = useNavigate();

  const clients = useClients();
  const tickets = useTickets({ limit: 10 });
  const recentLogs = useLogs({ limit: 10 });
  const softwareSnapshot = useSoftwareInventorySnapshot('global');
  const realtimeStats = useQuery({
    queryKey: ['realtime', 'stats'],
    queryFn: getRealtimeStats,
    refetchInterval: 10_000,
    refetchIntervalInBackground: true,
  });

  const agentQueries = useQueries({
    queries: (clients.data ?? []).map((client) => ({
      queryKey: ['agents', 'byClient', client.id, 'dashboard-total'],
      queryFn: () => agentsApi.listByClient(client.id),
      enabled: clients.isSuccess,
    })),
  });

  if (clients.isLoading) return <Loading />;
  if (clients.isError) {
    return (
      <ErrorDisplay
        message="Nao foi possivel comunicar com o servidor. Verifique se a API esta online e tente novamente."
        onRetry={() => clients.refetch()}
      />
    );
  }

  const ticketList = tickets.data ?? [];
  const logList = recentLogs.data ?? [];
  const totalInstalledSoftware = softwareSnapshot.data?.totalInstalled ?? 0;
  const business = realtimeStats.data?.business;
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

  const clientCount = business?.available
    ? (business.clients?.total ?? 0)
    : (clients.data?.length ?? 0);

  const totalAgents = business?.available
    ? (business.agents?.total ?? 0)
    : agentQueries.reduce((acc, query) => acc + (query.data?.length ?? 0), 0);

  const openTicketsCount = business?.available
    ? (business.tickets?.open ?? 0)
    : ticketList.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-sm text-slate-400">Visão geral do ambiente</p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <button
          type="button"
          onClick={() => navigate('/clients')}
          className="text-left"
          aria-label="Abrir pagina de clientes"
          title="Abrir clientes"
        >
          <StatCard
            icon={Users}
            label="Clientes"
            value={clientCount}
            tone="primary"
          />
        </button>
        <button
          type="button"
          onClick={() => navigate('/agents')}
          className="text-left"
          aria-label="Abrir pagina de agentes"
          title="Abrir agentes"
        >
          <StatCard
            icon={Monitor}
            label="Agentes"
            value={totalAgents}
            tone="accent"
            trend={
              business?.available && business.agents
                ? (
                  <span className="text-xs text-slate-400">
                    {business.agents.online} online / {business.agents.offline} offline
                  </span>
                )
                : undefined
            }
          />
        </button>
        <button
          type="button"
          onClick={() => navigate('/software-inventory')}
          className="text-left"
          aria-label="Abrir inventario de softwares"
          title="Abrir inventario de softwares"
        >
          <StatCard
            icon={AppWindow}
            label="Softwares instalados"
            value={softwareSnapshot.isLoading ? '—' : totalInstalledSoftware}
            tone="success"
          />
        </button>
        <button
          type="button"
          onClick={() => navigate('/tickets')}
          className="text-left"
          aria-label="Abrir pagina de chamados"
          title="Abrir chamados"
        >
          <StatCard
            icon={Ticket}
            label="Chamados Abertos"
            value={openTicketsCount}
            tone="warning"
            trend={
              business?.available && business.tickets
                ? (
                  <span className="text-xs text-slate-400">
                    {business.tickets.closed} fechados
                  </span>
                )
                : undefined
            }
          />
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Saúde da Plataforma"
            subtitle="Conectividade em tempo real e infraestrutura"
          />
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2">
              <span className="flex items-center gap-2 text-slate-300">
                <Activity className="h-4 w-4" /> NATS
              </span>
              <div className="flex items-center gap-2">
                <Badge color={realtime?.natsConnected ? 'success' : 'danger'}>
                  {realtime?.natsConnected ? 'Conectado' : 'Desconectado'}
                </Badge>
                {realtime?.natsConnectionState && (
                  <span className="text-xs text-slate-500">{realtime.natsConnectionState}</span>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2">
              <span className="flex items-center gap-2 text-slate-300">
                <Database className="h-4 w-4" /> Redis
              </span>
              <div className="flex items-center gap-2">
                <Badge color={realtime?.redisConnected ? 'success' : 'danger'}>
                  {realtime?.redisConnected ? 'Conectado' : 'Desconectado'}
                </Badge>
                {typeof realtime?.redisPingMs === 'number' && (
                  <span className="text-xs text-slate-500">{realtime.redisPingMs} ms</span>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2">
              <span className="flex items-center gap-2 text-slate-300">
                <Server className="h-4 w-4" /> Banco de dados
              </span>
              <div className="flex items-center gap-2">
                <Badge color={database?.connected ? 'success' : 'danger'}>
                  {database?.connected ? 'Conectado' : 'Desconectado'}
                </Badge>
                {database?.provider && (
                  <span className="text-xs text-slate-500">{database.provider}</span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1 text-xs text-slate-400">
              <div className="rounded-lg bg-white/5 px-3 py-2">
                <p className="text-slate-500">SignalR agents</p>
                <p className="mt-0.5 text-sm font-semibold text-white">
                  {realtime?.signalrConnectedAgents ?? 0}
                </p>
              </div>
              <div className="rounded-lg bg-white/5 px-3 py-2">
                <p className="text-slate-500">NATS TCP</p>
                <p className="mt-0.5 text-sm font-semibold text-white">
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
            <MetricTile
              label="Working Set"
              value={workingSet}
              icon={Cpu}
            />
            <MetricTile
              label="GC Heap"
              value={gcHeap}
              icon={Database}
            />
            <MetricTile
              label="Threads"
              value={processMetrics?.threadCount ?? '—'}
              icon={Activity}
            />
            <MetricTile
              label="Uptime"
              value={formatUptime(uptimeValue)}
              icon={Server}
            />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-400">
            <div className="rounded-lg bg-white/5 px-3 py-2">
              <p className="text-slate-500">ThreadPool worker</p>
              <p className="mt-0.5 text-sm font-semibold text-white">
                {workerAvailable ?? '—'} disp / {workerMin ?? '—'} min
              </p>
            </div>
            <div className="rounded-lg bg-white/5 px-3 py-2">
              <p className="text-slate-500">ThreadPool IO</p>
              <p className="mt-0.5 text-sm font-semibold text-white">
                {ioAvailable ?? '—'} disp / {ioMin ?? '—'} min
              </p>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Negócio em Tempo Real"
            subtitle="Contadores agregados do backend"
          />
          {!business?.available ? (
            <p className="text-sm text-slate-500">
              Métricas de negócio indisponíveis no endpoint no momento.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <MetricTile label="Clientes" value={business.clients?.total ?? 0} icon={Users} />
              <MetricTile label="Sites" value={business.sites?.total ?? 0} icon={Server} />
              <MetricTile label="Agentes online" value={business.agents?.online ?? 0} icon={Monitor} />
              <MetricTile label="Agentes offline" value={business.agents?.offline ?? 0} icon={WifiOff} />
              <MetricTile label="Comandos running" value={business.commands?.running ?? 0} icon={Activity} />
              <MetricTile label="Comandos falhos" value={business.commands?.failed ?? 0} icon={AlertTriangle} />
              <MetricTile label="Chamados abertos" value={business.tickets?.open ?? 0} icon={Ticket} />
              <MetricTile label="Chamados fechados" value={business.tickets?.closed ?? 0} icon={AppWindow} />
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Comandos (Visão Geral)" subtitle="Fila e execução" />
          {!business?.available ? (
            <p className="text-sm text-slate-500">Sem dados de comandos no momento.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <MetricTile label="Total" value={business.commands?.total ?? 0} icon={Activity} />
              <MetricTile label="Pending" value={business.commands?.pending ?? 0} icon={Server} />
              <MetricTile label="Sent" value={business.commands?.sent ?? 0} icon={Monitor} />
              <MetricTile label="Running" value={business.commands?.running ?? 0} icon={Cpu} />
              <MetricTile label="Completed" value={business.commands?.completed ?? 0} icon={Database} />
              <MetricTile label="Failed" value={business.commands?.failed ?? 0} icon={AlertTriangle} />
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Tickets */}
        <Card>
          <CardHeader title="Chamados Recentes" subtitle="Últimos 10 chamados" />
          <div className="space-y-2">
            {ticketList.length === 0 ? (
              <p className="text-sm text-slate-500">Nenhum chamado</p>
            ) : (
              ticketList.map(t => (
                <div
                  key={t.id}
                  className="flex items-center justify-between rounded-lg bg-white/5 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-200">{t.title}</p>
                    <p className="text-xs text-slate-500">
                      {new Date(t.createdAt).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  <PriorityBadge priority={t.priority} />
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Recent Logs */}
        <Card>
          <CardHeader title="Logs Recentes" subtitle="Últimas 10 entradas" />
          <div className="space-y-2">
            {logList.length === 0 ? (
              <p className="text-sm text-slate-500">Nenhum log</p>
            ) : (
              logList.map(log => (
                <div
                  key={log.id}
                  className="flex items-center gap-3 rounded-lg bg-white/5 px-4 py-3"
                >
                  <LogLevelIcon level={log.level} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-slate-200">{log.message}</p>
                    <p className="text-xs text-slate-500">
                      {new Date(log.createdAt).toLocaleDateString('pt-BR')}{' '}
                      {new Date(log.createdAt).toLocaleTimeString('pt-BR')}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function PriorityBadge({ priority }: { priority: TicketPriority }) {
  const map: Record<TicketPriority, { label: string; color: 'slate' | 'success' | 'warning' | 'danger' }> = {
    Low: { label: 'Baixa', color: 'slate' },
    Medium: { label: 'Média', color: 'success' },
    High: { label: 'Alta', color: 'warning' },
    Critical: { label: 'Crítica', color: 'danger' },
  };
  const { label, color } = map[priority] ?? { label: 'N/A', color: 'slate' as const };
  return <Badge color={color}>{label}</Badge>;
}

function LogLevelIcon({ level }: { level: LogLevel }) {
  switch (level) {
    case LogLevel.Error:
    case LogLevel.Critical:
      return <AlertTriangle className="h-4 w-4 shrink-0 text-danger" />;
    case LogLevel.Warning:
      return <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />;
    default:
      return <WifiOff className="h-4 w-4 shrink-0 text-slate-500" />;
  }
}

function MetricTile({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-lg bg-white/5 px-3 py-2">
      <div className="flex items-center gap-1.5 text-slate-500">
        <Icon className="h-3.5 w-3.5" />
        <span>{label}</span>
      </div>
      <p className="mt-1 text-base font-semibold text-white">{value}</p>
    </div>
  );
}
