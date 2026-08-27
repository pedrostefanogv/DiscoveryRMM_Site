import { useMemo, useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';
import { Building2, Plus } from 'lucide-react';
import { useClients } from '@/hooks/useClients';
import { useCreateSite, useDeleteSite, useRestartSite, useShutdownSite, useWakeOnLanSite } from '@/hooks/useSites';
import { useAgentsBySite } from '@/hooks/useAgents';
import { Badge, Button, Card, DataTable, ErrorDisplay, Input, Loading, Modal, Select, StatCard, TextArea } from '@/components/ui';
import { sitesApi, type Site, type SiteWakeOnLanResponse, type CreateSiteRequest } from '@/api';
import type { Column } from '@/components/ui';
import toast from 'react-hot-toast';
import SiteContextMenu, { type SiteContextAction } from '@/components/sites/SiteContextMenu';
import SiteTransferAgentsModal from '@/components/sites/SiteTransferAgentsModal';
import SitePowerConfirmationModal, { type SitePowerAction } from '@/components/sites/SitePowerConfirmationModal';
import SiteWakeOnLanModal from '@/components/sites/SiteWakeOnLanModal';
import { TransferBeforeDeleteModal } from '@/components/agents/TransferBeforeDeleteModal';

type SiteWithClient = Site & {
  clientName: string;
  clientActive: boolean;
};

export default function SiteList() {
  const navigate = useNavigate();
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

  const clients = useClients(showInactive);
  const visibleClients = useMemo(() => {
    const all = clients.data ?? [];
    if (filterClient) return all.filter((client) => client.id === filterClient);
    return all;
  }, [clients.data, filterClient]);

  const siteQueries = useQueries({
    queries: visibleClients.map((client) => ({
      queryKey: ['sites', 'byClient', client.id, showInactive] as const,
      queryFn: () => sitesApi.list(client.id, showInactive),
      enabled: !!client.id,
    })),
  });

  const sites = useMemo<SiteWithClient[]>(() => {
    return visibleClients.flatMap((client, index) => {
      const query = siteQueries[index];
      if (!query?.data) return [];
      return query.data.map((site) => ({
        ...site,
        clientName: client.name,
        clientActive: client.isActive,
      }));
    });
  }, [visibleClients, siteQueries]);

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

  const isLoading = clients.isLoading || siteQueries.some((query) => query.isLoading && !query.data);
  const hasQueryError = siteQueries.some((query) => query.isError);
  const activeSites = filteredSites.filter((site) => site.isActive).length;
  const representedClients = new Set(filteredSites.map((site) => site.clientId)).size;
  const clientOptions = [
    { value: '', label: 'Todos os clientes' },
    ...(clients.data ?? []).map((client) => ({ value: client.id, label: client.name })),
  ];

  if (clients.isLoading && !clients.data) return <Loading />;
  if (clients.isError) return <ErrorDisplay onRetry={() => clients.refetch()} />;
  if (hasQueryError && sites.length === 0) {
    return (
      <ErrorDisplay
        message="Não foi possível carregar os sites."
        onRetry={() => {
          void clients.refetch();
          siteQueries.forEach((query) => {
            void query.refetch();
          });
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
    }
  };
  const restartSite = useRestartSite();
  const shutdownSite = useShutdownSite();
  const wakeOnLanSite = useWakeOnLanSite();
  const deleteSiteMutation = useDeleteSite();

  const onlineCount = (activeSiteAgents ?? []).filter((a) => a.isOnline).length;
  const totalCount = (activeSiteAgents ?? []).length;
  const offlineCount = totalCount - onlineCount;

  const handleDeleteSiteNoAgents = (site: SiteWithClient) => {
    if (!window.confirm(`Tem certeza que deseja excluir o site "${site.name}"?`)) {
      setDeleteSiteModal(null);
      return;
    }
    deleteSiteMutation.mutate(
      { clientId: site.clientId, id: site.id },
      {
        onSuccess: () => {
          toast.success('Site excluído com sucesso');
          setDeleteSiteModal(null);
          void clients.refetch();
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

  // Quando o usuário clicar em "Apagar" e o site NÃO tiver agentes,
  // exibe um confirm e exclui direto (sem modal de transferência).
  useEffect(() => {
    if (!deleteSiteModal || activeSiteAgentsLoading) return;
    const hasAgents = (activeSiteAgents ?? []).length > 0;
    if (!hasAgents) {
      handleDeleteSiteNoAgents(deleteSiteModal);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deleteSiteModal, activeSiteAgentsLoading]);

  const handlePowerConfirm = async (data: { delaySeconds: number; force: boolean; message: string }) => {
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
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Sites</h1>
          <p className="text-sm text-muted">Visão global dos sites cadastrados por cliente</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(event) => setShowInactive(event.target.checked)}
              className="rounded border-border bg-surface-light"
            />
            Mostrar inativos
          </label>
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4" /> Novo Site
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={Building2} label="Total de sites" value={filteredSites.length} tone="accent" />
        <StatCard icon={Building2} label="Sites ativos" value={activeSites} tone="success" />
        <StatCard icon={Building2} label="Clientes representados" value={representedClients} tone="primary" />
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

      <CreateSiteModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        clients={clients.data ?? []}
      />

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

      {deleteSiteModal && (activeSiteAgents ?? []).length > 0 && (
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
    </div>
  );
}

function CreateSiteModal({
  open,
  onClose,
  clients,
}: {
  open: boolean;
  onClose: () => void;
  clients: { id: string; name: string }[];
}) {
  const create = useCreateSite();
  const [form, setForm] = useState<CreateSiteRequest & { clientId: string }>({
    clientId: '',
    name: '',
    notes: null,
  });

  // Reset form when modal opens
  const prevOpen = useRef(open);
  useEffect(() => {
    if (open && !prevOpen.current) {
      setForm({ clientId: '', name: '', notes: null });
    }
    prevOpen.current = open;
  }, [open]);

  const handleSubmit = () => {
    if (!form.clientId || !form.name.trim()) return;
    create.mutate(
      { clientId: form.clientId, data: { name: form.name, notes: form.notes } },
      {
        onSuccess: () => {
          toast.success('Site criado com sucesso');
          onClose();
          setForm({ clientId: '', name: '', notes: null });
        },
        onError: () => toast.error('Erro ao criar site'),
      },
    );
  };

  const clientOptions = [
    { value: '', label: 'Selecione um cliente', disabled: true },
    ...clients.map((c) => ({ value: c.id, label: c.name })),
  ];

  return (
    <Modal open={open} onClose={onClose} title="Novo Site">
      <div className="space-y-4">
        <Select
          label="Cliente"
          value={form.clientId}
          onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))}
          options={clientOptions}
        />
        <Input
          label="Nome do Site"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          required
        />
        <TextArea
          label="Observações"
          value={form.notes ?? ''}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value || null }))}
        />
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} loading={create.isPending}>
            Salvar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
