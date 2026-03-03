import { Users, Monitor, Ticket, AlertTriangle, Wifi, WifiOff } from 'lucide-react';
import { useClients } from '@/hooks/useClients';
import { useTickets } from '@/hooks/useTickets';
import { useLogs } from '@/hooks/useLogs';
import { StatCard, Card, CardHeader, Badge } from '@/components/ui';
import { Loading, ErrorDisplay } from '@/components/ui';
import { LogLevel } from '@/api';

export default function Dashboard() {
  const clients = useClients();
  const tickets = useTickets({ limit: 10 });
  const recentLogs = useLogs({ limit: 10 });

  if (clients.isLoading) return <Loading />;
  if (clients.isError) return <ErrorDisplay onRetry={() => clients.refetch()} />;

  const clientCount = clients.data?.length ?? 0;
  const ticketList = tickets.data ?? [];
  const logList = recentLogs.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-sm text-slate-400">Visão geral do ambiente</p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Users}
          label="Clientes"
          value={clientCount}
          tone="primary"
        />
        <StatCard
          icon={Monitor}
          label="Agentes"
          value="—"
          tone="accent"
        />
        <StatCard
          icon={Wifi}
          label="Online"
          value="—"
          tone="success"
        />
        <StatCard
          icon={Ticket}
          label="Chamados Abertos"
          value={ticketList.length}
          tone="warning"
        />
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

function PriorityBadge({ priority }: { priority: number }) {
  const map: Record<number, { label: string; color: 'slate' | 'success' | 'warning' | 'danger' }> = {
    0: { label: 'Baixa', color: 'slate' },
    1: { label: 'Média', color: 'success' },
    2: { label: 'Alta', color: 'warning' },
    3: { label: 'Crítica', color: 'danger' },
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
