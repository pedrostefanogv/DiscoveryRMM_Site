import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useClients } from '@/hooks/useClients';
import { useAllSites } from '@/hooks/useSites';
import { useAuthorization } from '@/auth/authorization';
import { Icon, Button, Card, DataTable, Badge, Loading, ErrorDisplay, Input, StatCard, PageHeader } from '@/components/ui';
import { ClientFormModal } from '@/components/entity/ClientFormModal';
import type { Client } from '@/api';
import type { Column } from '@/components/ui';

type ClientStatusFilter = 'active' | 'all' | 'inactive';

export default function ClientList({ embedded = false }: { embedded?: boolean } = {}) {
  const [statusFilter, setStatusFilter] = useState<ClientStatusFilter>('active');
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  // Busca todos (inclusive inativos) para os cards e filtro instantâneo sem nova requisição.
  const allClients = useClients(true);
  const allSitesQuery = useAllSites(true);
  const navigate = useNavigate();
  const { hasAnyPermission } = useAuthorization();
  const canCreate = hasAnyPermission(['Clients.Create', 'clients.*', 'admin.*']);

  const allData = useMemo(() => allClients.data ?? [], [allClients.data]);

  const { sitesCountByClient, agentsCountByClient, onlineAgentsCountByClient } = useMemo(() => {
    const sitesMap = new Map<string, number>();
    const agentsMap = new Map<string, number>();
    const onlineMap = new Map<string, number>();
    for (const site of allSitesQuery.data ?? []) {
      sitesMap.set(site.clientId, (sitesMap.get(site.clientId) ?? 0) + 1);
      agentsMap.set(site.clientId, (agentsMap.get(site.clientId) ?? 0) + (site.agentCount ?? 0));
      onlineMap.set(site.clientId, (onlineMap.get(site.clientId) ?? 0) + (site.agentOnlineCount ?? 0));
    }
    return {
      sitesCountByClient: sitesMap,
      agentsCountByClient: agentsMap,
      onlineAgentsCountByClient: onlineMap,
    };
  }, [allSitesQuery.data]);

  const displayedClients = useMemo(() => {
    const term = search.trim().toLowerCase();
    return allData
      .filter((c) => {
        if (statusFilter === 'active') return c.isActive;
        if (statusFilter === 'inactive') return !c.isActive;
        return true;
      })
      .filter((c) => !term || c.name.toLowerCase().includes(term) || (c.notes ?? '').toLowerCase().includes(term));
  }, [allData, statusFilter, search]);

  const activeClients = useMemo(() => allData.filter((c) => c.isActive).length, [allData]);
  const inactiveClients = allData.length - activeClients;

  const isRefreshing = allClients.isFetching || allSitesQuery.isFetching;
  const handleRefresh = () => {
    void allClients.refetch();
    void allSitesQuery.refetch();
  };

  const actionButtons = (
    <>
      <Button variant="secondary" onClick={handleRefresh} disabled={isRefreshing}>
        <Icon name="refresh" className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
        Atualizar
      </Button>
      {canCreate && (
        <Button variant="primary" onClick={() => setModalOpen(true)}>
          <Icon name="add" className="h-4 w-4" /> Novo Cliente
        </Button>
      )}
    </>
  );

  const columns: Column<Client>[] = [
    {
      key: 'name',
      header: 'Cliente',
      sortable: true,
      sortValue: (c) => c.name,
      render: (c) => (
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/20">
            <Icon name="apartment" className="h-4 w-4 text-primary" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="font-medium text-foreground">{c.name}</p>
            <p className="truncate text-xs text-muted">{c.notes?.trim() ? c.notes : 'Sem observações'}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'sites',
      header: 'Sites',
      sortable: true,
      sortValue: (c) => sitesCountByClient.get(c.id) ?? 0,
      render: (c) => {
        const count = sitesCountByClient.get(c.id) ?? 0;
        return (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              navigate(`/sites?client=${encodeURIComponent(c.id)}`);
            }}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 tabular-nums text-foreground transition-colors hover:bg-surface-light hover:text-primary"
            title={`Ver sites de ${c.name}`}
          >
            <span>{count}</span>
            <Icon name="open_in_new" className="h-3 w-3 text-muted" aria-hidden="true" />
          </button>
        );
      },
    },
    {
      key: 'agents',
      header: 'Agentes',
      sortable: true,
      sortValue: (c) => agentsCountByClient.get(c.id) ?? 0,
      render: (c) => {
        const total = agentsCountByClient.get(c.id) ?? 0;
        const online = onlineAgentsCountByClient.get(c.id) ?? 0;
        if (total === 0) {
          return <span className="text-muted">—</span>;
        }
        return (
          <div>
            <p className="tabular-nums text-foreground">
              {total} agente{total !== 1 ? 's' : ''}
            </p>
            <p className="text-xs tabular-nums text-muted">{online} online</p>
          </div>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      sortValue: (c) => (c.isActive ? 0 : 1),
      render: (c) => (
        <Badge color={c.isActive ? 'success' : 'slate'}>
          {c.isActive ? 'Ativo' : 'Inativo'}
        </Badge>
      ),
    },
  ];

  if (allClients.isLoading && !allClients.data) return <Loading />;
  if (allClients.isError) return <ErrorDisplay onRetry={() => void allClients.refetch()} />;

  return (
    <div className="space-y-6">
      {!embedded && (
        <PageHeader
          title="Clientes"
          description={`${displayedClients.length} de ${allData.length} cliente(s)`}
        >
          {actionButtons}
        </PageHeader>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          icon="apartment"
          label="Total de clientes"
          value={allData.length}
          tone="accent"
          onClick={() => setStatusFilter('all')}
          active={statusFilter === 'all'}
        />
        <StatCard
          icon="check_circle"
          label="Clientes ativos"
          value={activeClients}
          tone="success"
          onClick={() => setStatusFilter('active')}
          active={statusFilter === 'active'}
        />
        <StatCard
          icon="block"
          label="Clientes inativos"
          value={inactiveClients}
          tone="warning"
          onClick={() => setStatusFilter('inactive')}
          active={statusFilter === 'inactive'}
        />
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="relative w-full sm:max-w-sm">
          <Input
            label="Buscar"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nome ou observação"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Limpar busca"
              className="absolute right-2 bottom-2 rounded-full p-1 text-muted hover:bg-surface-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              <Icon name="close" className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {embedded && (
          <div className="flex flex-wrap items-center gap-2">{actionButtons}</div>
        )}
      </div>

      <Card padding={false}>
        <DataTable
          columns={columns}
          data={displayedClients}
          keyExtractor={(c) => c.id}
          emptyMessage="Nenhum cliente encontrado"
          onRowClick={(c) => navigate(`/clients/${c.id}`)}
        />
      </Card>

      <ClientFormModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
