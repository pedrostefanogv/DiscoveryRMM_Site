import { formatDate } from '@/utils/format';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { useClients } from '@/hooks/useClients';
import { useAllSites, useDeleteSite, useRestartSite, useShutdownSite, useWakeOnLanSite } from '@/hooks/useSites';
import { useAgentsBySite } from '@/hooks/useAgents';
import { Icon, Badge, Button, Card, ConfirmDialog, DataTable, ErrorDisplay, Input, Loading, PageHeader, Select, StatCard } from '@/components/ui';
import { type Site, type SiteWakeOnLanResponse } from '@/api';
import { useAuthorization } from '@/auth/authorization';
import type { Column } from '@/components/ui';
import toast from 'react-hot-toast';
import SiteContextMenu, { type SiteContextAction } from '@/components/sites/SiteContextMenu';
import SiteTransferAgentsModal from '@/components/sites/SiteTransferAgentsModal';
import SitePowerConfirmationModal, { type SitePowerAction } from '@/components/sites/SitePowerConfirmationModal';
import SiteWakeOnLanModal from '@/components/sites/SiteWakeOnLanModal';
import { TransferBeforeDeleteModal } from '@/components/agents/TransferBeforeDeleteModal';
import { SiteFormModal } from '@/components/entity/SiteFormModal';

type SiteWithClient = Site & {
  clientName: string;
  clientActive: boolean;
  /** Total de agentes do site (exclui os da lixeira). */
  agentCount?: number;
  /** Agentes com status online no site. */
  agentOnlineCount?: number;
};

type SiteStatusFilter = 'active' | 'all' | 'inactive';

export default function SiteList({ embedded = false }: { embedded?: boolean } = {}) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { hasAnyPermission } = useAuthorization();
  // Sites têm recurso/permissões próprios (SitesController existe na API).
  const canCreate = hasAnyPermission(['Sites.Create', 'sites.*', 'admin.*']);
  const [statusFilter, setStatusFilter] = useState<SiteStatusFilter>('active');
  const [search, setSearch] = useState('');
  const [filterClient, setFilterClient] = useState(() => searchParams.get('client') ?? '');
  const [modalOpen, setModalOpen] = useState(false);
  const [contextMenuSite, setContextMenuSite] = useState<SiteWithClient | null>(null);
  const [contextPosition, setContextPosition] = useState<{ x: number; y: number } | null>(null);

  // Power modals state
  const [transferSite, setTransferSite] = useState<SiteWithClient | null>(null);
  const [powerSite, setPowerSite] = useState<SiteWithClient | null>(null);
  const [powerAction, setPowerAction] = useState<SitePowerAction>('restart');
  const [wakeSite, setWakeSite] = useState<SiteWithClient | null>(null);
  const [deleteSiteModal, setDeleteSiteModal] = useState<SiteWithClient | null>(null);
  const [editSite, setEditSite] = useState<SiteWithClient | null>(null);

  useEffect(() => {
    setFilterClient(searchParams.get('client') ?? '');
  }, [searchParams]);

  const handleClientFilterChange = (nextClientId: string) => {
    setFilterClient(nextClientId);
    const next = new URLSearchParams(searchParams);
    if (nextClientId) next.set('client', nextClientId);
    else next.delete('client');
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  };

  // Clientes e sites sempre completos para compartilhar o mesmo cache de ClientList
  // e manter o contador de inativos exato nos cards.
  const clients = useClients(true);
  const allSitesQuery = useAllSites(true);

  const clientsById = useMemo(
    () => new Map((clients.data ?? []).map((client) => [client.id, client])),
    [clients.data],
  );

  const sites = useMemo<SiteWithClient[]>(() => {
    const list = (allSitesQuery.data ?? []).map((site) => {
      const client = clientsById.get(site.clientId);
      return {
        ...site,
        // O endpoint global já resolve o cliente; o mapa local cobre o
        // fallback (ex.: consultas em cache antigas).
        clientName: site.clientName ?? client?.name ?? 'Cliente desconhecido',
        clientActive: site.clientActive ?? client?.isActive ?? true,
      };
    });
    return filterClient ? list.filter((site) => site.clientId === filterClient) : list;
  }, [allSitesQuery.data, clientsById, filterClient]);

  const filteredSites = useMemo(() => {
    const term = search.trim().toLowerCase();
    return sites
      .filter((site) => {
        if (statusFilter === 'active') return site.isActive;
        if (statusFilter === 'inactive') return !site.isActive;
        return true;
      })
      .filter((site) => {
        if (!term) return true;
        return (
          site.name.toLowerCase().includes(term) ||
          site.clientName.toLowerCase().includes(term) ||
          (site.notes ?? '').toLowerCase().includes(term)
        );
      });
  }, [search, sites, statusFilter]);

  // Agents of the currently selected power/transfer/delete site, for counts & agentIds.
  const activeSite = transferSite ?? powerSite ?? wakeSite ?? deleteSiteModal ?? null;
  const { data: activeSiteAgents, isLoading: activeSiteAgentsLoading } = useAgentsBySite(activeSite?.id ?? '');

  // Mutations: keep every hook call above the conditional returns below,
  // otherwise the hook count changes between renders (React error #310).
  const restartSite = useRestartSite();
  const shutdownSite = useShutdownSite();
  const wakeOnLanSite = useWakeOnLanSite();
  const deleteSiteMutation = useDeleteSite();

  const columns: Column<SiteWithClient>[] = [
    {
      key: 'site',
      header: 'Site',
      sortValue: (site) => site.name,
      render: (site) => (
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/20">
            <Icon name="apartment" className="h-4 w-4 text-accent" />
          </div>
          <div>
            <p className="font-medium text-foreground">{site.name}</p>
            <p className="text-xs text-muted">{site.notes ?? 'Sem observações'}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'client',
      header: 'Cliente',
      sortValue: (site) => site.clientName ?? '',
      render: (site) => (
        <div>
          <p className="text-foreground">{site.clientName}</p>
          <p className="text-xs text-muted">
            {site.clientActive ? 'Cliente ativo' : 'Cliente inativo'}
          </p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (site) => (
        <div className="flex gap-2">
          <Badge color={site.isActive ? 'success' : 'slate'}>
            {site.isActive ? 'Ativo' : 'Inativo'}
          </Badge>
        </div>
      ),
    },
    {
      key: 'agents',
      header: 'Agentes',
      sortValue: (site) => site.agentCount ?? 0,
      render: (site) => {
        const total = site.agentCount ?? 0;
        const online = site.agentOnlineCount ?? 0;
        if (total === 0) {
          return <span className="text-muted">—</span>;
        }
        return (
          <div>
            <p className="text-foreground">{total} agente{total !== 1 ? 's' : ''}</p>
            <p className="text-xs text-muted">{online} online</p>
          </div>
        );
      },
    },
    {
      key: 'updatedAt',
      header: 'Atualizado em',
      render: (site) => (
        <span className="text-muted">
          {formatDate(site.updatedAt)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right w-12',
      render: (site) => (
        <Button
          size="sm"
          variant="ghost"
          className="px-2"
          aria-label={`Ações do site ${site.name}`}
          title="Mais ações"
          onClick={(event) => {
            event.stopPropagation();
            const rect = event.currentTarget.getBoundingClientRect();
            setContextMenuSite(site);
            setContextPosition({ x: rect.right - 200, y: rect.bottom + 4 });
          }}
        >
          <Icon name="more_vert" className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  const isLoading = (clients.isLoading && !clients.data) || allSitesQuery.isLoading;
  const hasQueryError = clients.isError || allSitesQuery.isError;
  const activeSites = sites.filter((site) => site.isActive).length;
  const inactiveSites = sites.length - activeSites;
  const totalAgents = sites.reduce((sum, site) => sum + (site.agentCount ?? 0), 0);
  const onlineAgents = sites.reduce((sum, site) => sum + (site.agentOnlineCount ?? 0), 0);
  const clientOptions = [
    { value: '', label: 'Todos os clientes' },
    ...(clients.data ?? []).map((client) => ({ value: client.id, label: client.name })),
  ];

  // Não bloqueia a tela se a lista de clientes falhar (ex.: usuário com acesso
  // só a Sites): os sites ainda renderizam, com nome de cliente desconhecido.
  if (allSitesQuery.isLoading && !allSitesQuery.data) return <Loading />;
  if (hasQueryError && sites.length === 0) {
    return (
      <ErrorDisplay
        message="Não foi possível carregar os sites."
        onRetry={() => {
          void clients.refetch();
          void allSitesQuery.refetch();
        }}
      />
    );
  }

  // ── Context menu actions ─────────────────────────────
  const handleRowContext = (event: React.MouseEvent<HTMLTableRowElement>, site: SiteWithClient) => {
    event.preventDefault();
    setContextMenuSite(site);
    setContextPosition({ x: event.clientX, y: event.clientY });
  };

  const closeContextMenu = () => {
    setContextMenuSite(null);
    setContextPosition(null);
  };

  const handleAction = (action: SiteContextAction) => {
    const site = contextMenuSite;
    if (!site) return;
    closeContextMenu();
    switch (action) {
      case 'wake-on-lan':
        setWakeSite(site);
        break;
      case 'shutdown':
        setPowerSite(site);
        setPowerAction('shutdown');
        break;
      case 'restart':
        setPowerSite(site);
        setPowerAction('restart');
        break;
      case 'transfer-agents':
        setTransferSite(site);
        break;
      case 'delete':
        setDeleteSiteModal(site);
        break;
      case 'edit':
        setEditSite(site);
        break;
    }
  };
  const onlineCount = (activeSiteAgents ?? []).filter((a) => a.isOnline).length;
  const totalCount = (activeSiteAgents ?? []).length;
  const offlineCount = totalCount - onlineCount;

  const handleConfirmDeleteNoAgents = () => {
    const site = deleteSiteModal;
    if (!site) return;
    deleteSiteMutation.mutate(
      { clientId: site.clientId, id: site.id },
      {
        onSuccess: () => {
          toast.success('Site excluído com sucesso');
          setDeleteSiteModal(null);
        },
        onError: () => toast.error('Erro ao excluir site'),
      },
    );
  };

  const handleTransferAndDelete = () => {
    const site = deleteSiteModal;
    if (!site) return;
    setDeleteSiteModal(null);
    deleteSiteMutation.mutate(
      { clientId: site.clientId, id: site.id },
      {
        onSuccess: () => {
          toast.success('Site excluído com sucesso');
          void clients.refetch();
        },
        onError: () => toast.error('Erro ao excluir site após transferência'),
      },
    );
  };

  const handlePowerConfirm = async (data: { delaySeconds: number; force: boolean; message: string; notifyUser: boolean }) => {
    const site = powerSite;
    const action = powerAction;
    if (!site) return;
    const mutation = action === 'shutdown' ? shutdownSite : restartSite;
    await mutation.mutateAsync(
      { clientId: site.clientId, siteId: site.id, data },
      {
        onSuccess: () => {
          toast.success(
            `Comando de ${action === 'shutdown' ? 'desligamento' : 'reinicialização'} enviado para ${onlineCount} agente(s) online do site "${site.name}".`,
          );
        },
        onError: (error) => {
          toast.error(error instanceof Error ? error.message : 'Falha ao enviar comando de energia.');
        },
      },
    );
  };

  const handleWakeOnLan = async (): Promise<SiteWakeOnLanResponse> => {
    const site = wakeSite;
    if (!site) throw new Error("Site não selecionado.");
    return wakeOnLanSite.mutateAsync(
      { clientId: site.clientId, siteId: site.id },
      {
        onError: (error) => {
          toast.error(error instanceof Error ? error.message : 'Falha ao enviar Wake-on-LAN.');
        },
      },
    );
  };

  const isRefreshing = clients.isFetching || allSitesQuery.isFetching;
  const handleRefresh = () => {
    void clients.refetch();
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
          <Icon name="add" className="h-4 w-4" /> Novo Site
        </Button>
      )}
    </>
  );

  return (
    <div className="space-y-6">
      {!embedded && (
        <PageHeader
          title="Sites"
          description={filteredSites.length + ' de ' + sites.length + ' site(s) · visão global por cliente'}
        >
          {actionButtons}
        </PageHeader>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon="apartment"
          label="Total de sites"
          value={sites.length}
          tone="accent"
          onClick={() => setStatusFilter('all')}
          active={statusFilter === 'all'}
        />
        <StatCard
          icon="check_circle"
          label="Sites ativos"
          value={activeSites}
          tone="success"
          onClick={() => setStatusFilter('active')}
          active={statusFilter === 'active'}
        />
        <StatCard
          icon="block"
          label="Sites inativos"
          value={inactiveSites}
          tone="warning"
          onClick={() => setStatusFilter('inactive')}
          active={statusFilter === 'inactive'}
        />
        <StatCard
          icon="desktop_windows"
          label="Agentes nos sites"
          value={totalAgents}
          tone="primary"
          trend={
            totalAgents > 0 ? (
              <span className="text-xs font-medium text-success">{onlineAgents} online</span>
            ) : undefined
          }
        />
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3 flex-1 min-w-[260px]">
          <div className="relative w-full sm:max-w-sm">
            <Input
              label="Buscar"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Nome do site, cliente ou observação"
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
          <Select
            label="Cliente"
            fullWidth={false}
            value={filterClient}
            onChange={(event) => handleClientFilterChange(event.target.value)}
            options={clientOptions}
          />
        </div>
        {embedded && (
          <div className="flex flex-wrap items-center gap-2">{actionButtons}</div>
        )}
      </div>

      <Card padding={false}>
        {isLoading ? (
          <Loading />
        ) : (
          <DataTable
            columns={columns}
            data={filteredSites}
            keyExtractor={(site) => site.id}
            emptyMessage="Nenhum site encontrado"
            onRowClick={(site) => navigate(`/clients/${site.clientId}/sites/${site.id}`)}
            onRowContextMenu={handleRowContext}
          />
        )}
      </Card>

      <SiteFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        clients={clients.data ?? []}
      />

      {editSite && (
        <SiteFormModal
          open
          onClose={() => setEditSite(null)}
          clientId={editSite.clientId}
          site={editSite}
        />
      )}

      {contextMenuSite && contextPosition && (
        <SiteContextMenu
          position={contextPosition}
          onAction={handleAction}
          onClose={closeContextMenu}
        />
      )}

      {transferSite && (
        <SiteTransferAgentsModal
          open
          onClose={() => setTransferSite(null)}
          sourceSiteName={transferSite.name}
          agentIds={(activeSiteAgents ?? []).map((a) => a.id)}
          onSuccess={() => {}}
        />
      )}

      {powerSite && (
        <SitePowerConfirmationModal
          open
          onClose={() => setPowerSite(null)}
          siteName={powerSite.name}
          action={powerAction}
          onlineCount={onlineCount}
          offlineCount={offlineCount}
          totalCount={totalCount}
          onConfirm={handlePowerConfirm}
          isLoading={restartSite.isPending || shutdownSite.isPending}
        />
      )}

      {wakeSite && (
        <SiteWakeOnLanModal
          open
          onClose={() => setWakeSite(null)}
          siteName={wakeSite.name}
          onConfirm={handleWakeOnLan}
        />
      )}

      {deleteSiteModal && !activeSiteAgentsLoading && (activeSiteAgents ?? []).length > 0 && (
        <TransferBeforeDeleteModal
          open
          onClose={() => setDeleteSiteModal(null)}
          entityType="site"
          entityName={deleteSiteModal.name}
          agentIds={(activeSiteAgents ?? []).map((a) => a.id)}
          sourceClientId={deleteSiteModal.clientId}
          onSuccess={handleTransferAndDelete}
        />
      )}

      <ConfirmDialog
        open={!!deleteSiteModal && !activeSiteAgentsLoading && (activeSiteAgents ?? []).length === 0}
        title="Excluir site"
        message={
          <>
            Tem certeza que deseja excluir o site{' '}
            <span className="font-semibold text-foreground">{deleteSiteModal?.name}</span>? Esta ação não pode ser desfeita.
          </>
        }
        confirmLabel="Excluir"
        onConfirm={handleConfirmDeleteNoAgents}
        onClose={() => setDeleteSiteModal(null)}
        isLoading={deleteSiteMutation.isPending}
      />
    </div>
  );
}

