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
  CheckCircle2,
  XCircle,
  Clock,
  Zap,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTickets } from '@/hooks/useTickets';
import { useLogs } from '@/hooks/useLogs';
import { useDashboardSummary } from '@/hooks/useDashboardSummary';
import { useP2POverview } from '@/hooks/useP2POverview';
import { useP2PTimeseries } from '@/hooks/useP2PTimeseries';
import { useP2PArtifactsDistribution } from '@/hooks/useP2PArtifactsDistribution';
import { useP2PAgentsRanking } from '@/hooks/useP2PAgentsRanking';
import { useP2PSeedPlan } from '@/hooks/useP2PSeedPlan';
import { StatCard, Card, CardHeader, Badge } from '@/components/ui';
import { Loading, ErrorDisplay } from '@/components/ui';
import { LogLevel, getRealtimeStats, type TicketPriority } from '@/api';
import { useSoftwareInventorySnapshot } from '@/hooks/useSoftwareInventory';
import type { DashboardWindow } from '@/api/dashboard';

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

const WINDOWS: { value: DashboardWindow; label: string }[] = [
  { value: '24h', label: 'Últimas 24h' },
  { value: '7d', label: 'Últimos 7 dias' },
  { value: '30d', label: 'Últimos 30 dias' },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const [window, setWindow] = useState<DashboardWindow>('24h');

  const dashboard = useDashboardSummary('global', window);
  const recentTickets = useTickets({ limit: 10 });
  const recentLogs = useLogs({ limit: 10 });
  const softwareSnapshot = useSoftwareInventorySnapshot('global');
  const realtimeStats = useQuery({
    queryKey: ['realtime', 'stats'],
    queryFn: getRealtimeStats,
    refetchInterval: 10_000,
    refetchIntervalInBackground: true,
  });
  const p2pScope = { scope: 'global' as const };
  const p2pOverview = useP2POverview(p2pScope);
  const p2pTimeseries = useP2PTimeseries({ ...p2pScope, metric: 'successRate', interval: window });
  const p2pArtifacts = useP2PArtifactsDistribution({ ...p2pScope, limit: 5, offset: 0 });
  const p2pRanking = useP2PAgentsRanking({ ...p2pScope, limit: 5, offset: 0 });
  const p2pSeedPlan = useP2PSeedPlan(p2pScope);

  const ds = dashboard.data;

  if (dashboard.isLoading && !ds) return <Loading />;
  if (dashboard.isError && !ds) {
    return (
      <ErrorDisplay
        message="Não foi possível comunicar com o servidor. Verifique se a API está online e tente novamente."
        onRetry={() => dashboard.refetch()}
      />
    );
  }

  const ticketList = recentTickets.data ?? [];
  const logList = recentLogs.data ?? [];
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
  const p2p = p2pOverview.data;

  return (
    <div className="space-y-6">
      {/* Header + Window Selector */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-sm text-slate-400">Visão geral do ambiente</p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 p-1">
          {WINDOWS.map(w => (
            <button
              key={w.value}
              type="button"
              onClick={() => setWindow(w.value)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                window === w.value
                  ? 'bg-primary text-white'
                  : 'text-slate-400 hover:text-white'
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
              <span className="text-xs text-slate-400">
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
                <span className="text-xs text-slate-400">{ds?.tickets.closed ?? 0} fechados</span>
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
            value={softwareSnapshot.isLoading ? '—' : totalInstalledSoftware}
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
            value={realtimeStats.data?.business?.clients?.total ?? '—'}
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
          <div className="grid grid-cols-2 gap-3">
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
          <div className="grid grid-cols-3 gap-3 text-sm">
            <MetricTile label="Pending" value={cmds?.pending ?? 0} icon={Clock} />
            <MetricTile label="Running" value={cmds?.running ?? 0} icon={Activity} />
            <MetricTile label="Completed" value={cmds?.completed ?? 0} icon={CheckCircle2} />
            <MetricTile label="Failed" value={cmds?.failed ?? 0} icon={XCircle} />
            <MetricTile label="Total" value={cmds?.total ?? 0} icon={Cpu} />
            <div className="rounded-lg bg-white/5 px-3 py-2 text-sm">
              <div className="flex items-center gap-1.5 text-slate-500">
                <Zap className="h-3.5 w-3.5" />
                <span>Sucesso</span>
              </div>
              <p className={`mt-1 text-base font-semibold ${(cmds?.successRate ?? 0) >= 80 ? 'text-success' : 'text-danger'}`}>
                {cmds?.total ? `${cmds.successRate.toFixed(1)}%` : '—'}
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
          <div className="grid grid-cols-3 gap-3 text-sm">
            <MetricTile label="Dispatched" value={auto?.dispatched ?? 0} icon={Zap} />
            <MetricTile label="Acknowledged" value={auto?.acknowledged ?? 0} icon={Activity} />
            <MetricTile label="Completed" value={auto?.completed ?? 0} icon={CheckCircle2} />
            <MetricTile label="Failed" value={auto?.failed ?? 0} icon={XCircle} />
            <MetricTile label="Total" value={auto?.total ?? 0} icon={Cpu} />
            <div className="rounded-lg bg-white/5 px-3 py-2 text-sm">
              <div className="flex items-center gap-1.5 text-slate-500">
                <Zap className="h-3.5 w-3.5" />
                <span>Sucesso</span>
              </div>
              <p className={`mt-1 text-base font-semibold ${(auto?.successRate ?? 0) >= 80 ? 'text-success' : 'text-danger'}`}>
                {auto?.total ? `${auto.successRate.toFixed(1)}%` : '—'}
              </p>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Distribuição de Logs"
            subtitle={`Entradas na janela • ${window}`}
          />
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg bg-danger/10 px-3 py-2">
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-danger" />
                <span className="text-slate-400">Erros</span>
              </div>
              <p className="mt-1 text-2xl font-bold text-white">{logs?.error ?? 0}</p>
            </div>
            <div className="rounded-lg bg-warning/10 px-3 py-2">
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                <span className="text-slate-400">Avisos</span>
              </div>
              <p className="mt-1 text-2xl font-bold text-white">{logs?.warn ?? 0}</p>
            </div>
            <div className="rounded-lg bg-white/5 px-3 py-2">
              <div className="flex items-center gap-1.5 text-slate-500">
                <Activity className="h-3.5 w-3.5" />
                <span>Info</span>
              </div>
              <p className="mt-1 text-2xl font-bold text-white">{logs?.info ?? 0}</p>
            </div>
            <div className="rounded-lg bg-white/5 px-3 py-2">
              <div className="flex items-center gap-1.5 text-slate-500">
                <Database className="h-3.5 w-3.5" />
                <span>Total</span>
              </div>
              <p className="mt-1 text-2xl font-bold text-white">{logs?.total ?? 0}</p>
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
            <MetricTile label="Working Set" value={workingSet} icon={Cpu} />
            <MetricTile label="GC Heap" value={gcHeap} icon={Database} />
            <MetricTile label="Threads" value={processMetrics?.threadCount ?? '—'} icon={Activity} />
            <MetricTile label="Uptime" value={formatUptime(uptimeValue)} icon={Server} />
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

      {/* Linha 5 – Operacional P2P */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="P2P Overview"
            subtitle="Indicadores operacionais de distribuição peer-to-peer"
          />
          <div className="grid grid-cols-2 gap-3 text-sm">
            <MetricTile label="Agentes ativos" value={p2p?.activeAgents ?? '—'} icon={Monitor} />
            <MetricTile label="Seeders" value={p2p?.seeders ?? '—'} icon={Server} />
            <MetricTile label="Success rate" value={typeof p2p?.successRate === 'number' ? `${p2p.successRate.toFixed(1)}%` : '—'} icon={CheckCircle2} />
            <MetricTile label="Bytes" value={formatBytes(p2p?.bytesTransferred)} icon={Database} />
          </div>
          <div className="mt-3 rounded-lg bg-white/5 px-3 py-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Health score</span>
              <span className="font-semibold text-white">
                {typeof p2p?.healthScore === 'number' ? p2p.healthScore.toFixed(1) : '—'}
              </span>
            </div>
            <progress
              value={Math.max(0, Math.min(100, p2p?.healthScore ?? 0))}
              max={100}
              className="status-bar status-bar-success mt-1.5"
              aria-label="Health score P2P"
            />
          </div>
        </Card>

        <Card>
          <CardHeader
            title="P2P Timeseries"
            subtitle="Últimos pontos da métrica success rate"
          />
          <div className="space-y-2 text-sm">
            {(p2pTimeseries.data?.points ?? []).slice(-8).map(point => (
              <div key={point.timestampUtc} className="rounded-lg bg-white/5 px-3 py-2">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>{new Date(point.timestampUtc).toLocaleDateString('pt-BR')}</span>
                  <span>{new Date(point.timestampUtc).toLocaleTimeString('pt-BR')}</span>
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-slate-300">Valor</span>
                  <span className="font-semibold text-white">{point.value.toFixed(2)}</span>
                </div>
              </div>
            ))}
            {(p2pTimeseries.data?.points?.length ?? 0) === 0 && (
              <p className="text-sm text-slate-500">Sem dados de série temporal para o filtro atual.</p>
            )}
          </div>
        </Card>
      </div>

      {/* Linha 6 – Distribuição de Artifacts + Ranking de Agentes */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="P2P Artifacts Distribution"
            subtitle="Distribuição de cache por peer"
          />
          <div className="space-y-2">
            {(p2pArtifacts.data?.items ?? []).map(item => (
              <div key={item.artifactId} className="rounded-lg bg-white/5 px-3 py-2">
                <div className="flex items-center justify-between">
                  <p className="truncate text-sm font-medium text-slate-200">{item.artifactName}</p>
                  <Badge color="primary">{item.peerCount} peers</Badge>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Atualizado em {new Date(item.lastUpdatedUtc).toLocaleDateString('pt-BR')}
                </p>
              </div>
            ))}
            {(p2pArtifacts.data?.items?.length ?? 0) === 0 && (
              <p className="text-sm text-slate-500">Nenhum artifact distribuído encontrado.</p>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="P2P Agents Ranking"
            subtitle="Top agentes por health score"
          />
          <div className="space-y-2">
            {(p2pRanking.data?.items ?? []).map(agent => (
              <div key={agent.agentId} className="rounded-lg bg-white/5 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium text-slate-200">{agent.agentName}</p>
                  <Badge color={agent.healthScore >= 80 ? 'success' : 'warning'}>
                    {agent.healthScore.toFixed(1)}
                  </Badge>
                </div>
                <div className="mt-1 grid grid-cols-3 gap-2 text-xs text-slate-400">
                  <span>Bytes: {formatBytes(agent.bytesTransferred)}</span>
                  <span>Fail: {agent.failureRate.toFixed(1)}%</span>
                  <span>Fila: {agent.queueLength}</span>
                </div>
              </div>
            ))}
            {(p2pRanking.data?.items?.length ?? 0) === 0 && (
              <p className="text-sm text-slate-500">Sem ranking de agentes no momento.</p>
            )}
          </div>
        </Card>
      </div>

      {/* Linha 7 – Seed Plan */}
      <div className="grid gap-6 lg:grid-cols-1">
        <Card>
          <CardHeader
            title="P2P Seed Plan"
            subtitle="Estado atual dos seed-plans por escopo"
          />
          <div className="space-y-2">
            {(p2pSeedPlan.data?.items ?? []).map((plan, idx) => (
              <div key={`${plan.scope}-${plan.siteId ?? 'global'}-${idx}`} className="rounded-lg bg-white/5 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-slate-200">
                    Escopo: {plan.scope}
                    {plan.tenantId ? ` • tenant ${plan.tenantId}` : ''}
                    {plan.siteId ? ` • site ${plan.siteId}` : ''}
                  </p>
                  <Badge color={plan.status.toLowerCase() === 'healthy' ? 'success' : 'warning'}>
                    {plan.status}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  Seeders desejados: {plan.desiredSeeders} • reais: {plan.actualSeeders}
                </p>
              </div>
            ))}
            {(p2pSeedPlan.data?.items?.length ?? 0) === 0 && (
              <p className="text-sm text-slate-500">Nenhuma configuração de seed plan encontrada.</p>
            )}
          </div>
        </Card>
      </div>

      {/* Linha 8 – Listas recentes */}
      <div className="grid gap-6 lg:grid-cols-2">
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

// ─── Sub-components ─────────────────────────────────────────────────────────

// tone maps the bg-* prop to a CSS class suffix (e.g. "bg-success" → "success")
const BG_TO_TONE: Record<string, string> = {
  'bg-success': 'success',
  'bg-danger': 'danger',
  'bg-warning': 'warning',
  'bg-primary': 'primary',
};

function StatusBar({
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
    <div className="rounded-lg bg-white/5 px-3 py-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-400">{label}</span>
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
