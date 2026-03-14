import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Monitor, Wifi, WifiOff, Activity, Building2, Clock, LayoutGrid, List } from 'lucide-react';
import { useQueries } from '@tanstack/react-query';
import { useClients } from '@/hooks/useClients';
import { agentsApi } from '@/api';
import { Badge, Loading, ErrorDisplay, Input, Select, StatCard } from '@/components/ui';
import type { Agent } from '@/api';
import { getAgentLastSeen, isAgentOnlineNow } from '@/utils/agentStatus';
import { useNowTick } from '@/hooks/useNowTick';

type AgentWithClient = Agent & { clientName: string; clientId: string };
const MAX_CLIENTS_IN_OVERVIEW = 5;

function formatRelative(dateStr: string | null, now: number): string {
  if (!dateStr) return '—';
  const diff = now - new Date(dateStr).getTime();
  if (diff < 60_000) return 'agora mesmo';
  if (diff < 3_600_000) return `há ${Math.floor(diff / 60_000)} min`;
  if (diff < 86_400_000) return `há ${Math.floor(diff / 3_600_000)} h`;
  return `há ${Math.floor(diff / 86_400_000)} d`;
}

function getOsIcon(os: string | null): string {
  if (!os) return '💻';
  const lower = os.toLowerCase();
  if (lower.includes('windows')) return '🪟';
  if (lower.includes('linux') || lower.includes('ubuntu') || lower.includes('debian') || lower.includes('centos')) return '🐧';
  if (lower.includes('mac') || lower.includes('darwin')) return '';
  return '💻';
}

export default function AgentList() {
  const navigate = useNavigate();
  const now = useNowTick(5_000);
  const clients = useClients();

  const [search, setSearch] = useState('');
  const [filterClient, setFilterClient] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'online' | 'offline'>('all');
  const [viewMode, setViewMode] = useState<'card' | 'list'>('card');

  const queriedClients = useMemo(() => {
    const allClients = clients.data ?? [];
    if (filterClient) {
      return allClients.filter(c => c.id === filterClient);
    }
    return allClients.slice(0, MAX_CLIENTS_IN_OVERVIEW);
  }, [clients.data, filterClient]);

  // Evita fan-out total: carrega apenas cliente filtrado ou um subconjunto.
  const agentQueries = useQueries({
    queries: queriedClients.map(c => ({
      queryKey: ['agents', 'byClient', c.id] as const,
      queryFn: () => agentsApi.listByClient(c.id),
      refetchInterval: 15_000,
      refetchIntervalInBackground: true,
    })),
  });

  const allAgents = useMemo<AgentWithClient[]>(() => {
    if (!queriedClients.length) return [];
    return queriedClients.flatMap((c, i) => {
      const q = agentQueries[i];
      if (!q?.data) return [];
      return q.data.map(a => ({ ...a, clientName: c.name, clientId: c.id }));
    });
  }, [queriedClients, agentQueries]);

  const isLoadingAgents = clients.isLoading || agentQueries.some(q => q.isLoading && !q.data);
  const totalOnline = allAgents.filter(a => isAgentOnlineNow(a, now)).length;
  const totalOffline = allAgents.length - totalOnline;

  const filtered = useMemo(() => allAgents.filter(a => {
    const online = isAgentOnlineNow(a, now);
    if (filterStatus === 'online' && !online) return false;
    if (filterStatus === 'offline' && online) return false;
    if (filterClient && a.clientId !== filterClient) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        (a.displayName ?? a.hostname).toLowerCase().includes(q) ||
        a.hostname.toLowerCase().includes(q) ||
        (a.operatingSystem ?? '').toLowerCase().includes(q) ||
        (a.lastIpAddress ?? '').includes(q) ||
        a.clientName.toLowerCase().includes(q)
      );
    }
    return true;
  }), [allAgents, filterStatus, filterClient, search, now]);

  if (clients.isError) return <ErrorDisplay onRetry={() => clients.refetch()} />;

  const clientOptions = [
    { value: '', label: 'Todos os clientes' },
    ...(clients.data ?? []).map(c => ({ value: c.id, label: c.name })),
  ];

  const statusOptions = [
    { value: 'all', label: 'Todos os status' },
    { value: 'online', label: 'Online' },
    { value: 'offline', label: 'Offline' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Agentes</h1>
        <p className="text-sm text-slate-400">Gerenciamento de dispositivos monitorados</p>
      </div>

      {/* StatCards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={Monitor} label="Total de Agentes" value={allAgents.length} tone="primary" />
        <StatCard
          icon={Wifi}
          label="Online"
          value={totalOnline}
          tone="success"
          trend={
            allAgents.length > 0 ? (
              <span className="text-success text-sm font-medium">
                {Math.round((totalOnline / allAgents.length) * 100)}%
              </span>
            ) : undefined
          }
        />
        <StatCard
          icon={WifiOff}
          label="Offline"
          value={totalOffline}
          tone="warning"
          trend={
            allAgents.length > 0 && totalOffline > 0 ? (
              <span className="text-warning text-sm font-medium">
                {Math.round((totalOffline / allAgents.length) * 100)}%
              </span>
            ) : undefined
          }
        />
      </div>

      {/* Filtros + toggle de visualização */}
      <div className="flex gap-3">
        <div className="grid flex-1 gap-3 sm:grid-cols-[1fr_220px_180px]">
          <Input
            placeholder="Buscar por nome, hostname, OS, IP ou cliente..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <Select
            options={clientOptions}
            value={filterClient}
            onChange={e => setFilterClient(e.target.value)}
          />
          <Select
            options={statusOptions}
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value as 'all' | 'online' | 'offline')}
          />
        </div>
        {/* Toggle card / lista */}
        <div className="flex shrink-0 items-end">
          <div className="flex overflow-hidden rounded-lg border border-white/10">
            <button
              onClick={() => setViewMode('card')}
              className={`flex h-9 w-9 items-center justify-center transition-colors ${viewMode === 'card' ? 'bg-primary/20 text-primary' : 'bg-white/5 text-slate-400 hover:text-slate-200'}`}
              title="Visualização em cards"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`flex h-9 w-9 items-center justify-center transition-colors ${viewMode === 'list' ? 'bg-primary/20 text-primary' : 'bg-white/5 text-slate-400 hover:text-slate-200'}`}
              title="Visualização em lista"
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {!filterClient && (clients.data?.length ?? 0) > MAX_CLIENTS_IN_OVERVIEW && (
        <div className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
          Exibindo agentes dos primeiros {MAX_CLIENTS_IN_OVERVIEW} clientes para reduzir carga. Selecione um cliente no filtro para visualizar dados específicos.
        </div>
      )}

      {/* Conteúdo */}
      {isLoadingAgents ? (
        <Loading message="Carregando agentes..." />
      ) : filtered.length === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-xl border border-white/5 bg-surface text-slate-500">
          <Monitor className="h-8 w-8 opacity-40" />
          <p className="text-sm">
            {allAgents.length === 0 ? 'Nenhum agente encontrado' : 'Nenhum agente corresponde aos filtros'}
          </p>
          {(search || filterClient || filterStatus !== 'all') && (
            <button
              className="text-xs text-primary hover:underline"
              onClick={() => { setSearch(''); setFilterClient(''); setFilterStatus('all'); }}
            >
              Limpar filtros
            </button>
          )}
        </div>
      ) : (
        <>
          <p className="text-xs text-slate-500">
            {filtered.length} agente{filtered.length !== 1 ? 's' : ''} exibido{filtered.length !== 1 ? 's' : ''}
          </p>

          {/* ── CARD VIEW ── */}
          {viewMode === 'card' && (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map(a => {
                const online = isAgentOnlineNow(a, now);
                const lastSeen = getAgentLastSeen(a);
                const displayName = a.displayName ?? a.hostname;
                return (
                  <button
                    key={a.id}
                    onClick={() => navigate(`/agents/${a.id}`)}
                    className="group relative flex flex-col gap-4 rounded-xl border border-white/5 bg-surface p-5 text-left transition-all hover:border-primary/30 hover:bg-white/5 hover:shadow-lg"
                  >
                    <span className={`absolute right-4 top-4 h-2.5 w-2.5 rounded-full ${online ? 'bg-success shadow-[0_0_6px_theme(colors.success)]' : 'bg-slate-600'}`} />
                    <div className="flex items-start gap-3 pr-6">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-xl">
                        {getOsIcon(a.operatingSystem)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-white transition-colors group-hover:text-primary">{displayName}</p>
                        {a.displayName && a.displayName !== a.hostname && (
                          <p className="truncate font-mono text-xs text-slate-500">{a.hostname}</p>
                        )}
                        <Badge color={online ? 'success' : 'slate'} className="mt-1.5">
                          <span className="flex items-center gap-1">
                            {online ? <Wifi className="h-2.5 w-2.5" /> : <WifiOff className="h-2.5 w-2.5" />}
                            {online ? 'Online' : 'Offline'}
                          </span>
                        </Badge>
                      </div>
                    </div>
                    <div className="space-y-1.5 text-xs">
                      <div className="flex items-center gap-2 text-slate-400">
                        <Activity className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                        <span className="truncate">{a.operatingSystem ?? '—'}{a.osVersion ? ` · ${a.osVersion}` : ''}</span>
                      </div>
                      {a.lastIpAddress && (
                        <div className="flex items-center gap-2 text-slate-400">
                          <span className="h-3.5 w-3.5 shrink-0 pt-px text-center font-mono text-[10px] leading-none text-slate-500">IP</span>
                          <span className="font-mono">{a.lastIpAddress}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-slate-400">
                        <Building2 className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                        <span className="truncate">{a.clientName}</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-400">
                        <Clock className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                        <span>{formatRelative(lastSeen, now)}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* ── LIST VIEW ── */}
          {viewMode === 'list' && (
            <div className="overflow-hidden rounded-xl border border-white/5 bg-surface">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5 text-left">
                    <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-500">Agente</th>
                    <th className="hidden px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-500 md:table-cell">Sistema Operacional</th>
                    <th className="hidden px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-500 lg:table-cell">IP</th>
                    <th className="hidden px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-500 sm:table-cell">Cliente</th>
                    <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-500">Status</th>
                    <th className="hidden px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-500 lg:table-cell">Último contato</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filtered.map(a => {
                    const online = isAgentOnlineNow(a, now);
                    const lastSeen = getAgentLastSeen(a);
                    const displayName = a.displayName ?? a.hostname;
                    return (
                      <tr
                        key={a.id}
                        onClick={() => navigate(`/agents/${a.id}`)}
                        className="cursor-pointer transition-colors hover:bg-white/5"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-base">
                              {getOsIcon(a.operatingSystem)}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate font-medium text-white">{displayName}</p>
                              {a.displayName && a.displayName !== a.hostname && (
                                <p className="truncate font-mono text-xs text-slate-500">{a.hostname}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="hidden px-4 py-3 text-slate-300 md:table-cell">
                          {a.operatingSystem ?? '—'}{a.osVersion ? ` · ${a.osVersion}` : ''}
                        </td>
                        <td className="hidden px-4 py-3 font-mono text-slate-400 lg:table-cell">
                          {a.lastIpAddress ?? '—'}
                        </td>
                        <td className="hidden px-4 py-3 text-slate-400 sm:table-cell">
                          {a.clientName}
                        </td>
                        <td className="px-4 py-3">
                          <Badge color={online ? 'success' : 'slate'}>
                            <span className="flex items-center gap-1">
                              {online ? <Wifi className="h-2.5 w-2.5" /> : <WifiOff className="h-2.5 w-2.5" />}
                              {online ? 'Online' : 'Offline'}
                            </span>
                          </Badge>
                        </td>
                        <td className="hidden px-4 py-3 text-xs text-slate-500 lg:table-cell">
                          {formatRelative(lastSeen, now)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
