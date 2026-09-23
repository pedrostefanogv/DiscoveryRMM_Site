import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AppWindow, Building2, Monitor, Pencil, Ticket as TicketIcon, Trash2 } from 'lucide-react';
import { useClient } from '@/hooks/useClients';
import { useSite, useDeleteSite } from '@/hooks/useSites';
import { useAgentsBySite } from '@/hooks/useAgents';
import { useTicketsByClient } from '@/hooks/useTickets';
import { useLogs } from '@/hooks/useLogs';
import { useDashboardSummary } from '@/hooks/useDashboardSummary';
import { useDashboardRealtime } from '@/hooks/useDashboardRealtime';
import { useNowTick } from '@/hooks/useNowTick';
import { useSoftwareInventorySnapshot } from '@/hooks/useSoftwareInventory';
import { Badge, Button, Card, CardHeader, ConfirmDialog, ErrorDisplay, Loading, PageHeader, StatCard } from '@/components/ui';
import { NotesPanel } from '@/components/notes/NotesPanel';
import { AgentMiniList } from '@/components/entity/AgentMiniList';
import { RecentTicketsCard } from '@/components/entity/RecentTicketsCard';
import { RecentLogsCard } from '@/components/entity/RecentLogsCard';
import { DashboardSummaryCard } from '@/components/entity/DashboardSummaryCard';
import { WindowSelector, normalizeDashboardWindow } from '@/components/entity/WindowSelector';
import { SiteFormModal } from '@/components/entity/SiteFormModal';
import { TransferBeforeDeleteModal } from '@/components/agents/TransferBeforeDeleteModal';
import { isAgentOnlineNow } from '@/utils/agentStatus';
import { ensureArray } from '@/utils/ensureArray';
import type { Agent, Ticket, LogEntry } from '@/api';
import type { DashboardWindow } from '@/api/dashboard';
import toast from 'react-hot-toast';

export default function SiteDetail() {
  const { id: clientId, siteId } = useParams<{ id: string; siteId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  // "range" (não "window") para não sombrear o objeto global window.
  const [range, setRange] = useState<DashboardWindow>(() =>
    normalizeDashboardWindow(searchParams.get('window')),
  );

  const [editSiteOpen, setEditSiteOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [transferModalOpen, setTransferModalOpen] = useState(false);

  const client = useClient(clientId!);
  const site = useSite(clientId!, siteId!);
  const agents = useAgentsBySite(siteId!);
  const deleteSite = useDeleteSite();
  const tickets = useTicketsByClient(clientId!);
  const logs = useLogs({ siteId, limit: 8 });
  const softwareSnapshot = useSoftwareInventorySnapshot('site', undefined, siteId);
  const dashboard = useDashboardSummary(
    { clientId: clientId!, siteId: siteId! },
    range,
    { enabled: !!clientId && !!siteId },
  );
  const now = useNowTick(5_000);

  useDashboardRealtime(
    { clientId: clientId!, siteId: siteId! },
    range,
    !!clientId && !!siteId,
  );

  // Memoized normalized arrays — MUST be before any early return (Rules of Hooks)
  const ticketsArray = useMemo(() => ensureArray<Ticket>(tickets.data), [tickets.data]);
  const logsArray = useMemo(() => ensureArray<LogEntry>(logs.data), [logs.data]);
  const agentsArray = useMemo(() => ensureArray<Agent>(agents.data), [agents.data]);

  if (client.isLoading || site.isLoading) return <Loading />;
  if (client.isError || site.isError || !client.data || !site.data) {
    return (
      <ErrorDisplay
        onRetry={() => {
          void client.refetch();
          void site.refetch();
        }}
      />
    );
  }

  const currentClient = client.data;
  const currentSite = site.data;

  const handleWindowChange = (value: DashboardWindow) => {
    setRange(value);
    const next = new URLSearchParams(searchParams);
    if (value === '24h') {
      next.delete('window');
    } else {
      next.set('window', value);
    }
    setSearchParams(next, { replace: true });
  };

  const siteTickets = ticketsArray.filter((ticket) => ticket.siteId === currentSite.id);
  const recentTickets = siteTickets.slice(0, 8);
  const recentLogs = logsArray.slice(0, 8);
  const totalAgents = agentsArray.length;
  const onlineAgents = agentsArray.filter((agent) => isAgentOnlineNow(agent, now)).length;
  const totalTickets = siteTickets.length;
  const totalInstalledSoftware = softwareSnapshot.data?.totalInstalled ?? 0;

  const handleDelete = () => {
    if (agentsArray.length > 0) {
      setTransferModalOpen(true);
    } else {
      setDeleteOpen(true);
    }
  };

  const confirmDeleteSite = () => {
    deleteSite.mutate(
      { clientId: currentClient.id, id: currentSite.id },
      {
        onSuccess: () => {
          toast.success('Site excluído com sucesso');
          navigate(`/clients/${currentClient.id}`);
        },
        onError: (error) => toast.error(error.message || 'Erro ao excluir site'),
      },
    );
  };

  const handleTransferAndDelete = () => {
    setTransferModalOpen(false);
    deleteSite.mutate(
      { clientId: currentClient.id, id: currentSite.id },
      {
        onSuccess: () => {
          toast.success('Site excluído com sucesso');
          navigate(`/clients/${currentClient.id}`);
        },
        onError: (error) => toast.error(error.message || 'Erro ao excluir site após transferência'),
      },
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={currentSite.name}
        description={`Cliente: ${currentClient.name}`}
        onBack={() => navigate(`/clients/${currentClient.id}`)}
        backLabel="Voltar para o cliente"
      >
        <Badge color={currentSite.isActive ? 'success' : 'slate'}>
          {currentSite.isActive ? 'Ativo' : 'Inativo'}
        </Badge>
        <WindowSelector value={range} onChange={handleWindowChange} />
        <Button size="sm" variant="ghost" onClick={() => setEditSiteOpen(true)}>
          <Pencil className="h-4 w-4" /> Editar
        </Button>
        <Button variant="danger" size="sm" onClick={handleDelete}>
          <Trash2 className="h-4 w-4" /> Excluir
        </Button>
      </PageHeader>

      {dashboard.data && (
        <DashboardSummaryCard
          data={dashboard.data}
          title="Dashboard do Site"
          subtitle={`Agregado da janela ${range}`}
        />
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Monitor}
          label="Agentes"
          value={agents.isLoading ? '—' : totalAgents}
          tone="primary"
          trend={
            !agents.isLoading && totalAgents > 0 ? (
              <span className={`text-xs font-medium ${onlineAgents > 0 ? 'text-success' : 'text-muted'}`}>
                {onlineAgents}/{totalAgents} online
              </span>
            ) : undefined
          }
        />
        <StatCard
          icon={TicketIcon}
          label="Chamados do site"
          value={dashboard.isLoading ? '—' : dashboard.data?.tickets.open ?? totalTickets}
          tone="warning"
          trend={
            dashboard.data && dashboard.data.tickets.slaBreachedOpen > 0 ? (
              <span className="text-xs font-medium text-danger">
                {dashboard.data.tickets.slaBreachedOpen} SLA violado
              </span>
            ) : undefined
          }
        />
        <StatCard
          icon={AppWindow}
          label="Softwares instalados"
          value={softwareSnapshot.isLoading ? '—' : totalInstalledSoftware}
          tone="success"
        />
        <StatCard
          icon={Building2}
          label={`Logs ${range}`}
          value={dashboard.isLoading ? '—' : dashboard.data?.logs.total ?? recentLogs.length}
          tone="accent"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Informações do Site" />
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-muted">Cliente</dt>
              <dd className="mt-0.5 text-foreground">{currentClient.name}</dd>
            </div>
            <div>
              <dt className="text-muted">Observações</dt>
              <dd className="mt-0.5 text-foreground">{currentSite.notes ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-muted">Criado em</dt>
              <dd className="mt-0.5 text-foreground">
                {new Date(currentSite.createdAt).toLocaleDateString('pt-BR')}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Atualizado em</dt>
              <dd className="mt-0.5 text-foreground">
                {new Date(currentSite.updatedAt).toLocaleDateString('pt-BR')}
              </dd>
            </div>
            <div className="border-t border-border pt-3">
              <dt className="text-muted">Softwares distintos</dt>
              <dd className="mt-0.5 text-foreground">
                {softwareSnapshot.isLoading ? '—' : softwareSnapshot.data?.distinctSoftware ?? 0}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Agentes com inventário</dt>
              <dd className="mt-0.5 text-foreground">
                {softwareSnapshot.isLoading ? '—' : softwareSnapshot.data?.distinctAgents ?? 0}
              </dd>
            </div>
          </dl>
        </Card>

        <div className="lg:col-span-2">
          <NotesPanel entityType="site" entityId={currentSite.id} title="Notas do Site" />
        </div>

        <RecentTicketsCard
          tickets={recentTickets}
          total={totalTickets}
          isLoading={tickets.isLoading}
          emptyMessage="Nenhum chamado neste site"
          onSelect={(ticket) => navigate(`/tickets/${ticket.id}`)}
          onViewAll={() => navigate('/tickets')}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <Card>
            <CardHeader title="Agentes do Site" subtitle={`${onlineAgents} online`} />
            <AgentMiniList
              agents={agentsArray}
              now={now}
              isLoading={agents.isLoading}
              emptyMessage="Nenhum agente neste site"
              onSelect={(agent) => navigate(`/agents/${agent.id}`)}
            />
          </Card>
        </div>

        <div className="lg:col-span-2">
          <RecentLogsCard
            logs={recentLogs}
            total={logsArray.length}
            isLoading={logs.isLoading}
            emptyMessage="Nenhum log registrado neste site"
            onViewAll={() => navigate('/logs')}
          />
        </div>
      </div>

      <SiteFormModal
        open={editSiteOpen}
        onClose={() => setEditSiteOpen(false)}
        clientId={currentClient.id}
        site={currentSite}
      />

      <ConfirmDialog
        open={deleteOpen}
        title="Excluir site"
        message={
          <>
            Tem certeza que deseja excluir o site{' '}
            <span className="font-semibold text-foreground">{currentSite.name}</span>? Esta ação não pode ser desfeita.
          </>
        }
        confirmLabel="Excluir"
        onConfirm={confirmDeleteSite}
        onClose={() => setDeleteOpen(false)}
        isLoading={deleteSite.isPending}
      />

      <TransferBeforeDeleteModal
        open={transferModalOpen}
        onClose={() => setTransferModalOpen(false)}
        entityType="site"
        entityName={currentSite.name}
        agentIds={agentsArray.map((a) => a.id)}
        sourceClientId={currentClient.id}
        onSuccess={handleTransferAndDelete}
      />
    </div>
  );
}
