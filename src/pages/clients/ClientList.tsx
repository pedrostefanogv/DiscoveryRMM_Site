import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';
import { Plus, Building2 } from 'lucide-react';
import { useClients } from '@/hooks/useClients';
import { useAllSites } from '@/hooks/useSites';
import { useAuthorization } from '@/auth/authorization';
import { Button, Card, DataTable, Badge, Loading, ErrorDisplay, Input, StatCard, PageHeader } from '@/components/ui';
import { ClientFormModal } from '@/components/entity/ClientFormModal';
import { agentsApi, type Client } from '@/api';
import type { Column } from '@/components/ui';

// Fan-out controlado: contagens de agentes exigem 1 requisição por cliente
// (não há endpoint global). Limita para não sobrecarregar a API.
const MAX_CLIENT_COUNT_QUERIES = 25;

export default function ClientList() {
  const [showInactive, setShowInactive] = useState(false);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  // Busca todos (inclusive inativos) para os cards; a tabela filtra no cliente.
  const allClients = useClients(true);
  const navigate = useNavigate();
  const { hasAnyPermission } = useAuthorization();
  const canCreate = hasAnyPermission(['Clients.Create', 'clients.*', 'admin.*']);

  const allData = useMemo(() => allClients.data ?? [], [allClients.data]);

  // Contagem de sites: uma única requisição global.
  const allSitesQuery = useAllSites(true);

  // Contagem de agentes: 1 requisição por cliente, limitada a um subconjunto.
  const queriedClients = useMemo(
    () => allData.slice(0, MAX_CLIENT_COUNT_QUERIES),
    [allData],
  );
  const agentQueries = useQueries({
    queries: queriedClients.map(c => ({
      queryKey: ['agents', 'byClient', c.id] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => agentsApi.listByClient(c.id, { signal }),
      staleTime: 60_000,
      refetchInterval: 300_000,
      refetchIntervalInBackground: false,
    })),
  });

  const sitesCountByClient = useMemo(() => {
    const map = new Map<string, number>();
    for (const site of allSitesQuery.data ?? []) {
      map.set(site.clientId, (map.get(site.clientId) ?? 0) + 1);
    }
    return map;
  }, [allSitesQuery.data]);

  const agentsCountByClient = useMemo(() => {
    const map = new Map<string, number>();
    queriedClients.forEach((client, index) => {
      const data = agentQueries[index]?.data;
      if (data) map.set(client.id, data.length);
    });
    return map;
  }, [queriedClients, agentQueries]);

  const displayedClients = useMemo(() => {
    const term = search.trim().toLowerCase();
    return allData
      .filter(c => showInactive || c.isActive)
      .filter(c => !term || c.name.toLowerCase().includes(term) || (c.notes ?? '').toLowerCase().includes(term));
  }, [allData, showInactive, search]);

  const activeClients = useMemo(() => allData.filter(c => c.isActive).length, [allData]);
  const inactiveClients = allData.length - activeClients;

  const columns: Column<Client>[] = [
    {
      key: 'name',
      header: 'Cliente',
      render: c => (
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/20">
            <Building2 className="h-4 w-4 text-primary" aria-hidden="true" />
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
      render: c => (
        <span className="tabular-nums text-foreground">
          {sitesCountByClient.has(c.id) ? sitesCountByClient.get(c.id) : '—'}
        </span>
      ),
    },
    {
      key: 'agents',
      header: 'Agentes',
      render: c => (
        <span className="tabular-nums text-foreground">
          {agentsCountByClient.has(c.id) ? agentsCountByClient.get(c.id) : '—'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: c => (
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
      <PageHeader
        title="Clientes"
        description={`${displayedClients.length} de ${allData.length} cliente(s)`}
      >
        <label className="flex items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={e => setShowInactive(e.target.checked)}
            className="rounded border-border bg-surface-light"
          />
          Mostrar inativos
        </label>
        {canCreate && (
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4" /> Novo Cliente
          </Button>
        )}
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={Building2} label="Total de clientes" value={allData.length} tone="accent" />
        <StatCard icon={Building2} label="Clientes ativos" value={activeClients} tone="success" />
        <StatCard icon={Building2} label="Clientes inativos" value={inactiveClients} tone="warning" />
      </div>

      <Card>
        <Input
          label="Buscar"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Nome ou observação"
        />
      </Card>

      <Card padding={false}>
        <DataTable
          columns={columns}
          data={displayedClients}
          keyExtractor={c => c.id}
          emptyMessage="Nenhum cliente encontrado"
          onRowClick={c => navigate(`/clients/${c.id}`)}
        />
      </Card>

      {allData.length > MAX_CLIENT_COUNT_QUERIES && (
        <p className="text-xs text-muted">
          Contagens de agentes calculadas para os primeiros {MAX_CLIENT_COUNT_QUERIES} clientes para reduzir carga na API.
        </p>
      )}

      <ClientFormModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
