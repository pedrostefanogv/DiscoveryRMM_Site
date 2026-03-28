import { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Monitor, Wifi, WifiOff, Activity, Building2, Clock, LayoutGrid, List, Bug } from 'lucide-react';
import { useQueries } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useAuth } from '@/auth/AuthContext';
import { useClients } from '@/hooks/useClients';
import { useMyProfile } from '@/hooks';
import { ApiError, agentsApi, authApi } from '@/api';
import { Badge, Loading, ErrorDisplay, Input, Select, StatCard, Modal } from '@/components/ui';
import type { Agent } from '@/api';
import { getAgentLastSeen, isAgentOnlineNow } from '@/utils/agentStatus';
import { useNowTick } from '@/hooks/useNowTick';
import { openRemoteDebugPopup } from './remoteDebugLauncher';

type AgentWithClient = Agent & { clientName: string; clientId: string };
type ContextMenuState = { x: number; y: number; agent: AgentWithClient } | null;
const MAX_CLIENTS_IN_OVERVIEW = 5;

const MESH_USERNAME_CLAIMS = [
  'mesh_username',
  'meshUsername',
  'mesh_user',
  'meshUser',
  'preferred_username',
  'unique_name',
  'name',
  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name',
];

function decodeBase64Url(value: string): string {
  const padded = value.padEnd(Math.ceil(value.length / 4) * 4, '=');
  const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');

  try {
    return decodeURIComponent(
      atob(base64)
        .split('')
        .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`)
        .join(''),
    );
  } catch {
    return atob(base64);
  }
}

function parseJwtPayload(token: string | null): Record<string, unknown> | null {
  if (!token) return null;
  const segments = token.split('.');
  if (segments.length < 2) return null;

  try {
    return JSON.parse(decodeBase64Url(segments[1])) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function resolveMeshUsername(
  accessToken: string | null,
  profileLogin: string | null,
): string | null {
  const payload = parseJwtPayload(accessToken);
  if (payload) {
    for (const claim of MESH_USERNAME_CLAIMS) {
      const raw = payload[claim];
      if (typeof raw === 'string' && raw.trim()) {
        return raw.trim();
      }
    }
  }

  if (profileLogin?.trim()) return profileLogin.trim();
  return null;
}

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
  const { session } = useAuth();
  const clients = useClients();
  const myProfile = useMyProfile();

  const [search, setSearch] = useState('');
  const [filterClient, setFilterClient] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'online' | 'offline'>('all');
  const [viewMode, setViewMode] = useState<'card' | 'list'>('card');
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [remoteOpen, setRemoteOpen] = useState(false);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [remoteUrl, setRemoteUrl] = useState<string | null>(null);
  const [remoteAgent, setRemoteAgent] = useState<AgentWithClient | null>(null);
  const [remoteDebugAgentId, setRemoteDebugAgentId] = useState<string | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);

  const meshUsername = useMemo(
    () => resolveMeshUsername(session.accessToken, myProfile.data?.login ?? null),
    [session.accessToken, myProfile.data?.login],
  );

  useEffect(() => {
    if (!contextMenu) return;

    const closeMenu = () => setContextMenu(null);
    window.addEventListener('click', closeMenu);
    window.addEventListener('scroll', closeMenu, true);
    window.addEventListener('contextmenu', closeMenu);

    return () => {
      window.removeEventListener('click', closeMenu);
      window.removeEventListener('scroll', closeMenu, true);
      window.removeEventListener('contextmenu', closeMenu);
    };
  }, [contextMenu]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setContextMenu(null);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!contextMenu || !contextMenuRef.current) return;
    const left = Math.max(8, Math.min(contextMenu.x, window.innerWidth - 220));
    const top = Math.max(8, Math.min(contextMenu.y, window.innerHeight - 64));
    contextMenuRef.current.style.left = `${left}px`;
    contextMenuRef.current.style.top = `${top}px`;
  }, [contextMenu]);

  const closeRemoteModal = () => {
    setRemoteOpen(false);
    setRemoteLoading(false);
    setRemoteError(null);
    setRemoteUrl(null);
    setRemoteAgent(null);
  };

  const openRemoteControl = async (agent: AgentWithClient) => {
    setContextMenu(null);
    setRemoteAgent(agent);
    setRemoteOpen(true);
    setRemoteLoading(true);
    setRemoteError(null);
    setRemoteUrl(null);

    if (!meshUsername) {
      setRemoteLoading(false);
      setRemoteError('Nao foi possivel identificar o usuario MeshCentral para sua sessao.');
      return;
    }

    try {
      const response = await authApi.getMeshCentralEmbedUrl({
        clientId: agent.clientId,
        siteId: agent.siteId,
        agentId: agent.id,
        meshUsername,
      });

      setRemoteUrl(response.url);
    } catch (error) {
      if (error instanceof ApiError) {
        setRemoteError(error.message);
      } else if (error instanceof Error) {
        setRemoteError(error.message);
      } else {
        setRemoteError('Falha ao iniciar o controle remoto.');
      }
    } finally {
      setRemoteLoading(false);
    }
  };

  const openRemoteDebug = async (agent: AgentWithClient) => {
    setContextMenu(null);
    if (remoteDebugAgentId) return;

    setRemoteDebugAgentId(agent.id);
    try {
      await openRemoteDebugPopup({
        agentId: agent.id,
        payload: {
          logLevel: 'info',
          preferredTransport: 'signalr',
          ttlMinutes: 20,
        },
      });
      toast.success(`Debug remoto aberto para ${agent.displayName ?? agent.hostname}.`);
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : 'Falha ao abrir o console de remote debug.';
      toast.error(message);
    } finally {
      setRemoteDebugAgentId(null);
    }
  };

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
                    onContextMenu={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setContextMenu({ x: event.clientX, y: event.clientY, agent: a });
                    }}
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
                        onContextMenu={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          setContextMenu({ x: event.clientX, y: event.clientY, agent: a });
                        }}
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

      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
          <div
            ref={contextMenuRef}
            className="fixed z-50 min-w-[200px] overflow-hidden rounded-lg border border-white/10 bg-slate-900 shadow-xl"
          >
            <button
              className="w-full px-3 py-2 text-left text-sm text-slate-200 transition-colors hover:bg-white/10"
              onClick={() => {
                void openRemoteControl(contextMenu.agent);
              }}
            >
              Controle remoto
            </button>
            <button
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-200 transition-colors hover:bg-white/10"
              onClick={() => {
                void openRemoteDebug(contextMenu.agent);
              }}
              disabled={remoteDebugAgentId === contextMenu.agent.id}
            >
              <Bug className="h-4 w-4" />
              {remoteDebugAgentId === contextMenu.agent.id ? 'Abrindo debug...' : 'Ver debug'}
            </button>
          </div>
        </>
      )}

      <Modal
        open={remoteOpen}
        onClose={closeRemoteModal}
        title={`Controle remoto${remoteAgent ? ` - ${remoteAgent.displayName ?? remoteAgent.hostname}` : ''}`}
        maxWidth="max-w-6xl"
      >
        <div className="space-y-3">
          {remoteLoading && <Loading message="Gerando sessao remota..." />}

          {!remoteLoading && remoteError && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {remoteError}
            </div>
          )}

          {!remoteLoading && remoteUrl && (
            <iframe
              title="MeshCentral Remote"
              src={remoteUrl}
              className="h-[70vh] w-full rounded-lg border border-white/10 bg-white"
              allow="clipboard-read; clipboard-write; fullscreen"
              referrerPolicy="no-referrer"
            />
          )}
        </div>
      </Modal>
    </div>
  );
}
