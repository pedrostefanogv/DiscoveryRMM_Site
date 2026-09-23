import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Plus, Monitor, Trash2, AppWindow, Building2, Ticket as TicketIcon, KeyRound, BookOpen, Pencil } from 'lucide-react';
import { useClient, useDeleteClient } from '@/hooks/useClients';
import { useSites } from '@/hooks/useSites';
import { useAgentsByClient } from '@/hooks/useAgents';
import { useTicketsByClient } from '@/hooks/useTickets';
import { useLogs } from '@/hooks/useLogs';
import { useDashboardSummary } from '@/hooks/useDashboardSummary';
import { useDashboardRealtime } from '@/hooks/useDashboardRealtime';
import { useNowTick } from '@/hooks/useNowTick';
import { useSoftwareInventorySnapshot } from '@/hooks/useSoftwareInventory';
import { Button, Card, CardHeader, Badge, Loading, ErrorDisplay, Modal, StatCard, PageHeader, ConfirmDialog } from '@/components/ui';
import { NotesPanel } from '@/components/notes/NotesPanel';
import { ClientFormModal } from '@/components/entity/ClientFormModal';
import { SiteFormModal } from '@/components/entity/SiteFormModal';
import { AgentMiniList } from '@/components/entity/AgentMiniList';
import { CreateDeployTokenModal } from '@/components/entity/CreateDeployTokenModal';
import { RecentTicketsCard } from '@/components/entity/RecentTicketsCard';
import { RecentLogsCard } from '@/components/entity/RecentLogsCard';
import { DashboardSummaryCard } from '@/components/entity/DashboardSummaryCard';
import { WindowSelector, normalizeDashboardWindow } from '@/components/entity/WindowSelector';
import { isAgentOnlineNow } from '@/utils/agentStatus';
import { TransferBeforeDeleteModal } from '@/components/agents/TransferBeforeDeleteModal';
import { ensureArray } from '@/utils/ensureArray';
import type { Site, Agent, Ticket, LogEntry } from '@/api';
import type { DashboardWindow } from '@/api/dashboard';
import toast from 'react-hot-toast';

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [range, setRange] = useState<DashboardWindow>(() =>
    normalizeDashboardWindow(searchParams.get('window')),
  );

  const [siteModalOpen, setSiteModalOpen] = useState(false);
  const [editClientOpen, setEditClientOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [notesSite, setNotesSite] = useState<Site | null>(null);
  const [deployModalOpen, setDeployModalOpen] = useState(false);
  const [transferModalOpen, setTransferModalOpen] = useState(false);

  const client = useClient(id!);
  const sites = useSites(id!);
  const agents = useAgentsByClient(id!);
  const tickets = useTicketsByClient(id!);
  const logs = useLogs({ clientId: id, limit: 8 });
  const softwareSnapshot = useSoftwareInventorySnapshot('client', id);
  const now = useNowTick(5_000);
  const deleteClient = useDeleteClient();
  const clientDashboard = useDashboardSummary({ clientId: id! }, range, { enabled: !!id });

  // Subscribe to client-scoped NATS dashboard events for targeted refetch.
  useDashboardRealtime({ clientId: id! }, range, !!id);

  // Memoized normalized arrays — MUST be before any early return (Rules of Hooks)
  const sitesArray = useMemo(() => ensureArray<Site>(sites.data), [sites.data]);
  const agentsArray = useMemo(() => ensureArray<Agent>(agents.data), [agents.data]);
  const ticketsArray = useMemo(() => ensureArray<Ticket>(tickets.data), [tickets.data]);
  const logsArray = useMemo(() => ensureArray<LogEntry>(logs.data), [logs.data]);

  if (client.isLoading) return <Loading />;
  if (client.isError || !client.data) return <ErrorDisplay onRetry={() => void client.refetch()} />;

  const c = client.data;

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

  const handleDelete = () => {
    if (agentsArray.length > 0) {
      setTransferModalOpen(true);
    } else {
      setDeleteOpen(true);
    }
  };

  const confirmDeleteClient = () => {
    deleteClient.mutate(c.id, {
      onSuccess: () => {
        toast.success('Cliente excluído');
        navigate('/clients');
      },
      onError: (error) => toast.error(error.message || 'Erro ao excluir'),
    });
  };

  const handleTransferAndDelete = () => {
    setTransferModalOpen(false);
    deleteClient.mutate(c.id, {
      onSuccess: () => {
        toast.success('Cliente excluído');
        navigate('/clients');
      },
      onError: (error) => toast.error(error.message || 'Erro ao excluir cliente após transferência'),
    });
  };

  const totalSites = sitesArray.length;
  const activeSitesList = sitesArray.filter((s) => s.isActive);
  const activeSites = activeSitesList.length;
  const totalAgents = agentsArray.length;
  const onlineAgents = agentsArray.filter((a) => isAgentOnlineNow(a, now)).length;
  const totalInstalledSoftware = softwareSnapshot.data?.totalInstalled ?? 0;
  const totalTickets = ticketsArray.length;
  const recentTickets = ticketsArray.slice(0, 6);
  const recentLogs = logsArray.slice(0, 8);
  return (
    <div className="space-y-6">
      <PageHeader
        title={c.name}
        description="Detalhes do Cliente"
        onBack={() => navigate('/clients')}
        backLabel="Voltar para clientes"
      >
        <Badge color={c.isActive ? 'success' : 'slate'}>{c.isActive ? 'Ativo' : 'Inativo'}</Badge>
        <WindowSelector value={range} onChange={handleWindowChange} />
        <Button size="sm" variant="ghost" onClick={() => setEditClientOpen(true)}>
          <Pencil className="h-4 w-4" /> Editar
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => navigate(`/knowledge?clientId=${c.id}`)}
        >
          <BookOpen className="h-4 w-4" /> Conhecimento
        </Button>
        <Button variant="danger" size="sm" onClick={handleDelete}>
          <Trash2 className="h-4 w-4" /> Excluir
        </Button>
      </PageHeader>

      {/* Mini-dashboard do cliente */}
      {clientDashboard.data && (
        <DashboardSummaryCard
          data={clientDashboard.data}
          title="Resumo do Cliente"
          subtitle={`Agregado da janela ${range}`}
        />
      )}

      {/* Stat Cards */}
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
          icon={Building2}
          label="Sites"
          value={sites.isLoading ? '—' : totalSites}
          tone="accent"
          trend={
            !sites.isLoading && totalSites > 0 ? (
              <span className="text-xs font-medium text-muted">{activeSites} ativos</span>
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
          icon={TicketIcon}
          label="Chamados"
          value={tickets.isLoading ? '—' : totalTickets}
          tone="warning"
        />
      </div>

      {/* Main grid: Info + Sites + Agents */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Informações */}
        <Card>
          <CardHeader title="Informações" />
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-muted">Observações</dt>
              <dd className="mt-0.5 text-foreground">{c.notes ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-muted">Criado em</dt>
              <dd className="mt-0.5 text-foreground">{new Date(c.createdAt).toLocaleDateString('pt-BR')}</dd>
            </div>
            <div>
              <dt className="text-muted">Atualizado em</dt>
              <dd className="mt-0.5 text-foreground">{new Date(c.updatedAt).toLocaleDateString('pt-BR')}</dd>
            </div>
            <div className="border-t border-border pt-3">
              <dt className="text-muted">Softwares distintos</dt>
              <dd className="mt-0.5 text-foreground">
                {softwareSnapshot.isLoading ? '—' : (softwareSnapshot.data?.distinctSoftware ?? 0)}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Agentes com inventário</dt>
              <dd className="mt-0.5 text-foreground">
                {softwareSnapshot.isLoading ? '—' : (softwareSnapshot.data?.distinctAgents ?? 0)}
              </dd>
            </div>
          </dl>
        </Card>

        <div className="lg:col-span-2">
          <NotesPanel entityType="client" entityId={c.id} title="Notas do Cliente" />
        </div>

        {/* Sites */}
        <Card>
          <CardHeader
            title="Sites"
            subtitle={`${totalSites} total`}
            action={
              <Button size="sm" variant="ghost" onClick={() => setSiteModalOpen(true)} aria-label="Cadastrar site">
                <Plus className="h-4 w-4" />
              </Button>
            }
          />
          <div className="space-y-2">
            {sitesArray.map((site) => (
              <div
                key={site.id}
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/clients/${c.id}/sites/${site.id}`)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    navigate(`/clients/${c.id}/sites/${site.id}`);
                  }
                }}
                className="flex cursor-pointer items-center gap-3 rounded-lg bg-surface-light px-3 py-2 transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              >
                <Building2 className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{site.name}</p>
                  {site.notes && <p className="truncate text-xs text-muted">{site.notes}</p>}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(event) => {
                        event.stopPropagation();
                        navigate(`/clients/${c.id}/sites/${site.id}`);
                      }}
                    >
                      Dashboard
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(event) => {
                        event.stopPropagation();
                        setNotesSite(site);
                      }}
                    >
                      Notas
                    </Button>
                  </div>
                </div>
                <Badge color={site.isActive ? 'success' : 'slate'}>{site.isActive ? 'Ativo' : 'Inativo'}</Badge>
              </div>
            ))}
            {sites.isLoading && <p className="text-sm text-muted">Carregando...</p>}
            {totalSites === 0 && !sites.isLoading && (
              <p className="text-sm text-muted">Nenhum site cadastrado</p>
            )}
          </div>
        </Card>

        <RecentTicketsCard
          tickets={recentTickets}
          total={totalTickets}
          isLoading={tickets.isLoading}
          onSelect={(ticket) => navigate(`/tickets/${ticket.id}`)}
          onViewAll={() => navigate('/tickets')}
        />
      </div>

      {/* Bottom grid: Agents + Logs */}
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <Card>
            <CardHeader
              title="Agentes"
              subtitle={`${onlineAgents} online`}
              action={
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setDeployModalOpen(true)}
                  aria-label="Criar token de deploy"
                  title="Criar token de deploy"
                >
                  <KeyRound className="h-4 w-4" />
                </Button>
              }
            />
            <AgentMiniList
              agents={agentsArray}
              now={now}
              isLoading={agents.isLoading}
              emptyMessage="Nenhum agente"
              onSelect={(agent) => navigate(`/agents/${agent.id}`)}
            />
          </Card>
        </div>

        <div className="lg:col-span-2">
          <RecentLogsCard
            logs={recentLogs}
            total={logsArray.length}
            isLoading={logs.isLoading}
            onViewAll={() => navigate('/logs')}
          />
        </div>
      </div>

      <SiteFormModal
        open={siteModalOpen}
        onClose={() => setSiteModalOpen(false)}
        clientId={c.id}
      />

      <ClientFormModal
        open={editClientOpen}
        onClose={() => setEditClientOpen(false)}
        client={c}
      />

      <ConfirmDialog
        open={deleteOpen}
        title="Excluir cliente"
        message={
          <>
            Tem certeza que deseja excluir o cliente{' '}
            <span className="font-semibold text-foreground">{c.name}</span>? Esta ação não pode ser desfeita.
          </>
        }
        confirmLabel="Excluir"
        onConfirm={confirmDeleteClient}
        onClose={() => setDeleteOpen(false)}
        isLoading={deleteClient.isPending}
      />

      <Modal
        open={!!notesSite}
        onClose={() => setNotesSite(null)}
        title={notesSite ? `Notas do Site - ${notesSite.name}` : 'Notas do Site'}
        maxWidth="max-w-3xl"
      >
        {notesSite && (
          <NotesPanel entityType="site" entityId={notesSite.id} title="Notas do Site" />
        )}
      </Modal>

      <CreateDeployTokenModal
        open={deployModalOpen}
        onClose={() => setDeployModalOpen(false)}
        clientId={c.id}
        sites={activeSitesList.map((site) => ({ id: site.id, name: site.name }))}
      />

      <TransferBeforeDeleteModal
        open={transferModalOpen}
        onClose={() => setTransferModalOpen(false)}
        entityType="client"
        entityName={c.name}
        agentIds={agentsArray.map((a) => a.id)}
        sourceClientId={c.id}
        onSuccess={handleTransferAndDelete}
      />
    </div>
  );
}
