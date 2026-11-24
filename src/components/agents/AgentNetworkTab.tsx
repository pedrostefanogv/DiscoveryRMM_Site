import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  ApiError,
  agentsApi,
  type ListeningPortInfo,
  type NetworkAdapterInfo,
  type OpenSocketInfo,
} from '@/api';
import {
  LISTENING_PORTS_BACKEND_LIMIT,
  LISTENING_PORTS_MAX_PAGE_SIZE,
  OPEN_SOCKETS_BACKEND_LIMIT,
  OPEN_SOCKETS_MAX_PAGE_SIZE,
} from '@/api/backendLimits';
import { DetailTabs, type DetailTab } from '@/components/entity/DetailTabs';
import {
  Badge,
  Button,
  DataTable,
  ErrorDisplay,
  Icon,
  Input,
  Loading,
  Pagination,
  Select,
  type Column,
} from '@/components/ui';
import { useAgentListeningPortsPage, useAgentOpenSocketsPage } from '@/hooks/useAgents';
import { formatDate, formatSocketFamily, type AgentNetworkView } from '@/pages/agents/agentDetailUtils';

const NETWORK_TABS: DetailTab<AgentNetworkView>[] = [
  { id: 'adapters', label: 'Adaptadores', icon: 'settings_ethernet' },
  { id: 'listeningPorts', label: 'Portas em Escuta', icon: 'podcasts' },
  { id: 'openSockets', label: 'Conexões Abertas', icon: 'cable' },
];

const PAGE_SIZE_OPTIONS = [
  { value: '10', label: '10 por página' },
  { value: '30', label: '30 por página' },
  { value: '50', label: '50 por página' },
  { value: '100', label: '100 por página' },
  { value: 'max', label: 'Todos' },
];

const SOCKET_STATE_OPTIONS = [
  { value: 'all', label: 'Todos os estados' },
  { value: 'open', label: 'Somente abertas (sem TIME_WAIT)' },
  { value: 'ESTABLISHED', label: 'ESTABLISHED' },
  { value: 'TIME_WAIT', label: 'TIME_WAIT' },
  { value: 'CLOSE_WAIT', label: 'CLOSE_WAIT' },
];

interface AgentNetworkTabProps {
  agentId: string;
  activeView: AgentNetworkView;
  onSelectView: (view: AgentNetworkView) => void;
  networkAdapters: NetworkAdapterInfo[] | null | undefined;
  isOnline: boolean;
  canExecute?: boolean;
}

async function copyText(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copiado.`);
  } catch {
    toast.error(`Não foi possível copiar ${label.toLowerCase()}.`);
  }
}

export function AgentNetworkTab({
  agentId,
  activeView,
  onSelectView,
  networkAdapters,
  isOnline,
  canExecute = true,
}: AgentNetworkTabProps) {
  const [portsCursors, setPortsCursors] = useState<(string | undefined)[]>([undefined]);
  const [listeningPortsLimit, setListeningPortsLimit] = useState('10');
  const [listeningPortsSearchInput, setListeningPortsSearchInput] = useState('');
  const [listeningPortsSearchApplied, setListeningPortsSearchApplied] = useState('');
  const [isRefreshingPorts, setIsRefreshingPorts] = useState(false);

  const [socketsCursors, setSocketsCursors] = useState<(string | undefined)[]>([undefined]);
  const [openSocketsLimit, setOpenSocketsLimit] = useState('10');
  const [openSocketsSearchInput, setOpenSocketsSearchInput] = useState('');
  const [openSocketsSearchApplied, setOpenSocketsSearchApplied] = useState('');
  const [openSocketsStateFilter, setOpenSocketsStateFilter] = useState('all');
  const [isRefreshingConnections, setIsRefreshingConnections] = useState(false);

  useEffect(() => {
    const trimmed = listeningPortsSearchInput.trim();
    if (trimmed === listeningPortsSearchApplied) return;
    const timer = setTimeout(() => {
      setListeningPortsSearchApplied(trimmed);
      setPortsCursors([undefined]);
    }, 400);
    return () => clearTimeout(timer);
  }, [listeningPortsSearchInput, listeningPortsSearchApplied]);

  useEffect(() => {
    const trimmed = openSocketsSearchInput.trim();
    if (trimmed === openSocketsSearchApplied) return;
    const timer = setTimeout(() => {
      setOpenSocketsSearchApplied(trimmed);
      setSocketsCursors([undefined]);
    }, 400);
    return () => clearTimeout(timer);
  }, [openSocketsSearchInput, openSocketsSearchApplied]);

  const portsPageQuery = useAgentListeningPortsPage(
    agentId,
    {
      cursor: portsCursors[portsCursors.length - 1],
      limit: listeningPortsLimit === 'max' ? LISTENING_PORTS_MAX_PAGE_SIZE : Number(listeningPortsLimit),
      search: listeningPortsSearchApplied,
    },
    { enabled: activeView === 'listeningPorts' },
  );

  const socketsPageQuery = useAgentOpenSocketsPage(
    agentId,
    {
      cursor: socketsCursors[socketsCursors.length - 1],
      limit: openSocketsLimit === 'max' ? OPEN_SOCKETS_MAX_PAGE_SIZE : Number(openSocketsLimit),
      search: openSocketsSearchApplied,
      state: openSocketsStateFilter,
    },
    { enabled: activeView === 'openSockets' },
  );

  const portsPageItems: ListeningPortInfo[] = portsPageQuery.data?.items ?? [];
  const portsTotalCount = portsPageQuery.data?.totalCount ?? 0;
  const socketsPageItems: OpenSocketInfo[] = socketsPageQuery.data?.items ?? [];
  const socketsTotalCount = socketsPageQuery.data?.totalCount ?? 0;

  const portsLimitNum = listeningPortsLimit === 'max' ? LISTENING_PORTS_MAX_PAGE_SIZE : Number(listeningPortsLimit);
  const portsPageIndex = portsCursors.length;
  const portsTotalPages = Math.max(1, Math.ceil(portsTotalCount / portsLimitNum));
  const resetPortsPagination = () => setPortsCursors([undefined]);
  const goToNextPortsPage = () => {
    const next = portsPageQuery.data?.nextCursor;
    if (next) setPortsCursors(prev => [...prev, next]);
  };
  const goToPreviousPortsPage = () => setPortsCursors(prev => (prev.length > 1 ? prev.slice(0, -1) : prev));

  const handleApplyPortsSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setListeningPortsSearchApplied(listeningPortsSearchInput.trim());
    resetPortsPagination();
  };
  const handleClearPortsSearch = () => {
    setListeningPortsSearchInput('');
    setListeningPortsSearchApplied('');
    resetPortsPagination();
  };
  const handlePortsLimitChange = (value: string) => {
    setListeningPortsLimit(value);
    resetPortsPagination();
  };

  const socketsLimitNum = openSocketsLimit === 'max' ? OPEN_SOCKETS_MAX_PAGE_SIZE : Number(openSocketsLimit);
  const socketsPageIndex = socketsCursors.length;
  const socketsTotalPages = Math.max(1, Math.ceil(socketsTotalCount / socketsLimitNum));
  const resetSocketsPagination = () => setSocketsCursors([undefined]);
  const goToNextSocketsPage = () => {
    const next = socketsPageQuery.data?.nextCursor;
    if (next) setSocketsCursors(prev => [...prev, next]);
  };
  const goToPreviousSocketsPage = () => setSocketsCursors(prev => (prev.length > 1 ? prev.slice(0, -1) : prev));

  const handleApplySocketsSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setOpenSocketsSearchApplied(openSocketsSearchInput.trim());
    resetSocketsPagination();
  };
  const handleClearSocketsSearch = () => {
    setOpenSocketsSearchInput('');
    setOpenSocketsSearchApplied('');
    resetSocketsPagination();
  };
  const handleSocketsLimitChange = (value: string) => {
    setOpenSocketsLimit(value);
    resetSocketsPagination();
  };
  const handleSocketsStateChange = (value: string) => {
    setOpenSocketsStateFilter(value);
    resetSocketsPagination();
  };

  const handleRefreshPorts = async () => {
    if (!agentId || isRefreshingPorts || !canExecute) return;
    setIsRefreshingPorts(true);
    try {
      await agentsApi.refreshData(agentId, { listeningPorts: true });
      toast.success('Solicitação de coleta de portas enviada ao agente.');
      await new Promise(r => setTimeout(r, 2000));
      resetPortsPagination();
      await portsPageQuery.refetch();
    } catch (error) {
      const msg = error instanceof ApiError ? error.message : 'Falha ao solicitar refresh de portas.';
      toast.error(msg);
    } finally {
      setIsRefreshingPorts(false);
    }
  };

  const handleRefreshConnections = async () => {
    if (!agentId || isRefreshingConnections || !canExecute) return;
    setIsRefreshingConnections(true);
    try {
      await agentsApi.refreshData(agentId, { openConnections: true });
      toast.success('Solicitação de coleta de conexões enviada ao agente.');
      await new Promise(r => setTimeout(r, 2000));
      resetSocketsPagination();
      await socketsPageQuery.refetch();
    } catch (error) {
      const msg = error instanceof ApiError ? error.message : 'Falha ao solicitar refresh de conexões.';
      toast.error(msg);
    } finally {
      setIsRefreshingConnections(false);
    }
  };

  const listeningPortColumns = useMemo<Column<ListeningPortInfo>[]>(
    () => [
      {
        key: 'protocol',
        header: 'Protocolo',
        className: 'w-24',
        sortable: false,
        render: item => <span className="font-mono uppercase text-muted-foreground">{item.protocol ?? '\u2014'}</span>,
      },
      {
        key: 'address',
        header: 'Endereço',
        sortable: false,
        render: item => {
          const endpoint = `${item.address ?? '\u2014'}:${item.port}`;
          return (
            <span className="inline-flex items-center gap-1.5 font-mono text-muted-foreground">
              <span>{endpoint}</span>
              <button
                type="button"
                aria-label={`Copiar endereço ${endpoint}`}
                title="Copiar endereço"
                className="rounded p-0.5 text-muted hover:bg-surface-hover hover:text-foreground"
                onClick={e => {
                  e.stopPropagation();
                  void copyText(endpoint, 'Endereço');
                }}
              >
                <Icon name="content_copy" className="h-3 w-3" />
              </button>
            </span>
          );
        },
      },
      {
        key: 'process',
        header: 'Processo',
        sortable: false,
        render: item => (
          <div>
            <p className="text-sm text-foreground">{item.processName ?? '\u2014'}</p>
            <p className="text-xs text-muted">PID {item.processId}</p>
          </div>
        ),
      },
      {
        key: 'collectedAt',
        header: 'Última coleta',
        sortable: false,
        render: item => formatDate(item.collectedAt),
      },
    ],
    [],
  );

  const openSocketColumns = useMemo<Column<OpenSocketInfo>[]>(
    () => [
      {
        key: 'protocol',
        header: 'Protocolo',
        className: 'w-24',
        sortable: false,
        render: item => <span className="font-mono uppercase text-muted-foreground">{item.protocol ?? '\u2014'}</span>,
      },
      {
        key: 'family',
        header: 'Família',
        className: 'w-20',
        sortable: false,
        render: item => <Badge color="slate">{formatSocketFamily(item.family)}</Badge>,
      },
      {
        key: 'state',
        header: 'Estado',
        className: 'w-32',
        sortable: false,
        render: item => {
          const state = (item.state ?? '').toUpperCase();
          const tone =
            state === 'ESTABLISHED' ? 'success'
            : state === 'TIME_WAIT' || state === 'CLOSE_WAIT' || state === 'FIN_WAIT1' || state === 'FIN_WAIT2' || state === 'CLOSING' || state === 'LAST_ACK' ? 'warning'
            : 'slate';
          return <Badge color={tone}>{item.state || '—'}</Badge>;
        },
      },
      {
        key: 'local',
        header: 'Origem',
        sortable: false,
        render: item => (
          <span className="font-mono text-muted-foreground">
            {item.localAddress ?? '\u2014'}:{item.localPort}
          </span>
        ),
      },
      {
        key: 'remote',
        header: 'Destino',
        sortable: false,
        render: item => (
          <span className="font-mono text-muted-foreground">
            {item.remoteAddress ?? '\u2014'}:{item.remotePort}
          </span>
        ),
      },
      {
        key: 'process',
        header: 'Processo',
        sortable: false,
        render: item => (
          <div>
            <p className="text-sm text-foreground">{item.processName ?? '\u2014'}</p>
            <p className="text-xs text-muted">PID {item.processId}</p>
          </div>
        ),
      },
      {
        key: 'collectedAt',
        header: 'Última coleta',
        sortable: false,
        render: item => formatDate(item.collectedAt),
      },
    ],
    [],
  );

  return (
    <div className="space-y-4">
      <DetailTabs
        tabs={NETWORK_TABS}
        active={activeView}
        onChange={onSelectView}
        ariaLabel="Seções de rede do agente"
        panelIdPrefix="agent-network-tabs"
      />

      <div
        id="agent-network-tabs-panel"
        role="tabpanel"
        aria-labelledby={`agent-network-tabs-tab-${activeView}`}
      >
        {activeView === 'adapters' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-foreground sm:text-xl">Adaptadores de Rede</h3>
              {networkAdapters && networkAdapters.length > 0 && (
                <p className="text-sm text-muted">{networkAdapters.length} adaptador(es)</p>
              )}
            </div>
            {networkAdapters && networkAdapters.length > 0 ? (
              <div className="space-y-2">
                {networkAdapters.map(n => (
                  <div key={n.id} className="rounded-lg border border-border bg-surface-light px-3 py-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{n.name}</p>
                        {n.macAddress && (
                          <div className="mt-0.5 flex items-center gap-1.5">
                            <p className="font-mono text-xs text-muted">{n.macAddress}</p>
                            <button
                              type="button"
                              aria-label={`Copiar MAC ${n.macAddress}`}
                              title="Copiar MAC"
                              className="rounded p-0.5 text-muted hover:bg-surface-hover hover:text-foreground"
                              onClick={() => void copyText(n.macAddress!, 'MAC')}
                            >
                              <Icon name="content_copy" className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </div>
                      <Badge color={n.isDhcpEnabled ? 'success' : 'slate'}>{n.isDhcpEnabled ? 'DHCP' : 'Estático'}</Badge>
                    </div>
                    {(n.ipAddress || n.ipv6Address || n.gateway) && (
                      <div className="mt-1.5 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                        {n.ipAddress && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-muted">IP: </span>
                            <span className="font-mono text-muted-foreground">{n.ipAddress}</span>
                            {n.subnetMask && <span className="text-muted">/ {n.subnetMask}</span>}
                            <button
                              type="button"
                              aria-label={`Copiar IP ${n.ipAddress}`}
                              title="Copiar IP"
                              className="rounded p-0.5 text-muted hover:bg-surface-hover hover:text-foreground"
                              onClick={() => void copyText(n.ipAddress!, 'IP')}
                            >
                              <Icon name="content_copy" className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                        {n.gateway && (
                          <div>
                            <span className="text-muted">Gateway: </span>
                            <span className="font-mono text-muted-foreground">{n.gateway}</span>
                          </div>
                        )}
                        {n.ipv6Address && (
                          <div className="col-span-full">
                            <span className="text-muted">IPv6: </span>
                            <span className="break-all font-mono text-xs text-muted-foreground">{n.ipv6Address}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted">Nenhum adaptador de rede coletado para este agente.</p>
            )}
          </div>
        )}

        {activeView === 'listeningPorts' && (
          <div className="w-full min-w-0 max-w-full">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-foreground sm:text-xl">Portas em Escuta</h3>
                <p className="text-sm text-muted">{portsTotalCount} porta(s) ativa(s)</p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleRefreshPorts}
                loading={isRefreshingPorts}
                disabled={!canExecute}
                title={
                  !canExecute
                    ? 'Sem permissão para executar ações no agente'
                    : !isOnline
                      ? 'Agente offline — o pedido de coleta entra na fila e roda quando ele reconectar'
                      : 'Solicitar nova coleta de portas ao agente'
                }
              >
                <Icon name="refresh" className="h-4 w-4" />
                Atualizar
              </Button>
            </div>
            {portsTotalCount >= LISTENING_PORTS_BACKEND_LIMIT && (
              <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400">
                <Icon name="warning" className="h-3.5 w-3.5 shrink-0" />
                Lista truncada pelo backend no limite de {LISTENING_PORTS_BACKEND_LIMIT} itens. Podem existir mais portas em escuta.
              </div>
            )}
            <form className="mb-4 grid gap-3 lg:grid-cols-[1fr_160px_auto_auto]" onSubmit={handleApplyPortsSearch}>
              <div className="relative">
                <Input
                  value={listeningPortsSearchInput}
                  onChange={e => setListeningPortsSearchInput(e.target.value)}
                  placeholder="Pesquisar por processo, PID, protocolo, endereço ou porta"
                />
                {listeningPortsSearchInput && (
                  <button
                    type="button"
                    onClick={handleClearPortsSearch}
                    aria-label="Limpar busca de portas"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted hover:bg-surface-hover hover:text-foreground"
                  >
                    <Icon name="close" className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <Select
                value={listeningPortsLimit}
                options={PAGE_SIZE_OPTIONS}
                onChange={e => handlePortsLimitChange(e.target.value)}
              />
              <Button type="submit" variant="secondary" size="sm">
                <Icon name="search" className="h-4 w-4" />
                Buscar
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={handleClearPortsSearch}>
                Limpar
              </Button>
            </form>

            {portsPageQuery.isLoading ? (
              <Loading message="Carregando portas em escuta..." />
            ) : portsPageQuery.isError ? (
              <ErrorDisplay onRetry={() => void portsPageQuery.refetch()} />
            ) : (
              <>
                <DataTable
                  columns={listeningPortColumns}
                  data={portsPageItems}
                  keyExtractor={item => `${item.protocol}|${item.address}:${item.port}|${item.processId}`}
                  emptyMessage="Nenhuma porta em escuta encontrada"
                  showPagination={false}
                  maxHeight="min(640px, 55vh)"
                />
                {portsPageItems.length > 0 && (
                  <Pagination
                    className="mt-4"
                    page={portsPageIndex}
                    totalPages={portsTotalPages}
                    onPageChange={() => {}}
                    totalItems={portsTotalCount}
                    pageSize={portsLimitNum}
                    itemLabel={`${portsTotalCount} no total`}
                    cursor={{
                      hasPrev: portsPageIndex > 1,
                      hasNext: Boolean(portsPageQuery.data?.hasMore && portsPageQuery.data?.nextCursor),
                      onPrev: goToPreviousPortsPage,
                      onNext: goToNextPortsPage,
                      loading: portsPageQuery.isFetching,
                    }}
                  />
                )}
              </>
            )}
          </div>
        )}

        {activeView === 'openSockets' && (
          <div className="w-full min-w-0 max-w-full">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-foreground sm:text-xl">Conexões Abertas</h3>
                <p className="text-sm text-muted">{socketsTotalCount} conexão(ões) ativa(s)</p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleRefreshConnections}
                loading={isRefreshingConnections}
                disabled={!canExecute}
                title={
                  !canExecute
                    ? 'Sem permissão para executar ações no agente'
                    : !isOnline
                      ? 'Agente offline — o pedido de coleta entra na fila e roda quando ele reconectar'
                      : 'Solicitar nova coleta de conexões ao agente'
                }
              >
                <Icon name="refresh" className="h-4 w-4" />
                Atualizar
              </Button>
            </div>
            {socketsTotalCount >= OPEN_SOCKETS_BACKEND_LIMIT && (
              <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                <Icon name="warning" className="h-3.5 w-3.5 shrink-0" />
                Lista truncada pelo backend no limite de {OPEN_SOCKETS_BACKEND_LIMIT} itens. Podem existir mais conexões abertas.
              </div>
            )}
            <form className="mb-4 grid gap-3 lg:grid-cols-[1fr_170px_220px_auto_auto]" onSubmit={handleApplySocketsSearch}>
              <div className="relative">
                <Input
                  value={openSocketsSearchInput}
                  onChange={e => setOpenSocketsSearchInput(e.target.value)}
                  placeholder="Pesquisar por processo, PID, protocolo, endereço, porta ou estado"
                />
                {openSocketsSearchInput && (
                  <button
                    type="button"
                    onClick={handleClearSocketsSearch}
                    aria-label="Limpar busca de conexões"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted hover:bg-surface-hover hover:text-foreground"
                  >
                    <Icon name="close" className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <Select
                value={openSocketsStateFilter}
                options={SOCKET_STATE_OPTIONS}
                onChange={e => handleSocketsStateChange(e.target.value)}
              />
              <Select
                value={openSocketsLimit}
                options={PAGE_SIZE_OPTIONS}
                onChange={e => handleSocketsLimitChange(e.target.value)}
              />
              <Button type="submit" variant="secondary" size="sm">
                <Icon name="search" className="h-4 w-4" />
                Buscar
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={handleClearSocketsSearch}>
                Limpar
              </Button>
            </form>

            {socketsPageQuery.isLoading ? (
              <Loading message="Carregando conexões abertas..." />
            ) : socketsPageQuery.isError ? (
              <ErrorDisplay onRetry={() => void socketsPageQuery.refetch()} />
            ) : (
              <>
                <DataTable
                  columns={openSocketColumns}
                  data={socketsPageItems}
                  keyExtractor={item => `${item.protocol}|${item.family}|${item.localAddress}:${item.localPort}|${item.remoteAddress}:${item.remotePort}|${item.processId}`}
                  emptyMessage="Nenhuma conexão aberta encontrada"
                  showPagination={false}
                  maxHeight="min(640px, 55vh)"
                />
                {socketsPageItems.length > 0 && (
                  <Pagination
                    className="mt-4"
                    page={socketsPageIndex}
                    totalPages={socketsTotalPages}
                    onPageChange={() => {}}
                    totalItems={socketsTotalCount}
                    pageSize={socketsLimitNum}
                    itemLabel={`${socketsTotalCount} no total`}
                    cursor={{
                      hasPrev: socketsPageIndex > 1,
                      hasNext: Boolean(socketsPageQuery.data?.hasMore && socketsPageQuery.data?.nextCursor),
                      onPrev: goToPreviousSocketsPage,
                      onNext: goToNextSocketsPage,
                      loading: socketsPageQuery.isFetching,
                    }}
                  />
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
