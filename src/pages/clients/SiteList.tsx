import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Plus } from 'lucide-react';
import { useClients } from '@/hooks/useClients';
import { useAllSites, useDeleteSite, useRestartSite, useShutdownSite, useWakeOnLanSite } from '@/hooks/useSites';
import { useAgentsBySite } from '@/hooks/useAgents';
import { Badge, Button, Card, ConfirmDialog, DataTable, ErrorDisplay, Input, Loading, PageHeader, Select, StatCard } from '@/components/ui';
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
};

export default function SiteList() {
  const navigate = useNavigate();
  const { hasAnyPermission } = useAuthorization();
  // Sites têm recurso/permissões próprios (SitesController existe na API).
  const canCreate = hasAnyPermission(['Sites.Create', 'sites.*', 'admin.*']);
  const [showInactive, setShowInactive] = useState(false);
  const [search, setSearch] = useState('');
  const [filterClient, setFilterClient] = useState('');
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

  // Clientes sempre completos (nome/ativo + opções de filtro/criação); os sites
  // vêm de uma única requisição global (sem N+1 por cliente).
  const clients = useClients(true);
  const allSitesQuery = useAllSites(showInactive);

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
    return sites.filter((site) => {
      if (!term) return true;
      return (
        site.name.toLowerCase().includes(term) ||
        site.clientName.toLowerCase().includes(term) ||
        (site.notes ?? '').toLowerCase().includes(term)
      );
    });
  }, [search, sites]);

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
      render: (site) => (
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/20">
            <Building2 className="h-4 w-4 text-accent" />
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
      key: 'updatedAt',
      header: 'Atualizado em',
      render: (site) => (
        <span className="text-muted">
          {new Date(site.updatedAt).toLocaleDateString('pt-BR')}
        </span>
      ),
    },
  ];

  const isLoading = (clients.isLoading && !clients.data) || allSitesQuery.isLoading;
  const hasQueryError = clients.isError || allSitesQuery.isError;
  const activeSites = sites.filter((site) => site.isActive).length;
  const inactiveSites = sites.length - activeSites;
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sites"
        description={filteredSites.length + ' de ' + sites.length + ' site(s) · visão global por cliente'}
      >
        <label className="flex items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(event) => setShowInactive(event.target.checked)}
            className="rounded border-border bg-surface-light"
          />
          Mostrar inativos
        </label>
        {canCreate && (
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4" /> Novo Site
          </Button>
        )}
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={Building2} label="Total de sites" value={sites.length} tone="accent" />
        <StatCard icon={Building2} label="Sites ativos" value={activeSites} tone="success" />
        <StatCard icon={Building2} label="Sites inativos" value={inactiveSites} tone="warning" />
      </div>

      <Card>
        <div className="grid gap-3 md:grid-cols-[1fr,260px]">
          <Input
            label="Buscar"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Nome do site, cliente ou observação"
          />
          <Select
            label="Cliente"
            value={filterClient}
            onChange={(event) => setFilterClient(event.target.value)}
            options={clientOptions}
          />
        </div>
      </Card>

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

