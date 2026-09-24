import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Plus,
  Monitor,
  Trash2,
  AppWindow,
  Building2,
  Ticket as TicketIcon,
  KeyRound,
  BookOpen,
  Pencil,
  Bell,
  StickyNote,
  Users,
} from 'lucide-react';
import { useClient, useDeleteClient } from '@/hooks/useClients';
import { useSites } from '@/hooks/useSites';
import { useAgentsByClient } from '@/hooks/useAgents';
import { useTicketsByClient } from '@/hooks/useTickets';
import { useLogs } from '@/hooks/useLogs';
import { useDashboardSummary } from '@/hooks/useDashboardSummary';
import { useDashboardRealtime } from '@/hooks/useDashboardRealtime';
import { useNowTick } from '@/hooks/useNowTick';
import { useSoftwareInventorySnapshot } from '@/hooks/useSoftwareInventory';
import { useSendScopeNotification } from '@/hooks/useAgentAlerts';
import { useAuthorization } from '@/auth/authorization';
import { Button, Card, CardHeader, Badge, Loading, ErrorDisplay, Modal, StatCard, PageHeader, ConfirmDialog, EmptyState } from '@/components/ui';
import { NotesPanel } from '@/components/notes/NotesPanel';
import { ClientFormModal } from '@/components/entity/ClientFormModal';
import { SiteFormModal } from '@/components/entity/SiteFormModal';
import { AgentMiniList } from '@/components/entity/AgentMiniList';
import { CreateDeployTokenModal } from '@/components/entity/CreateDeployTokenModal';
import { RecentTicketsCard } from '@/components/entity/RecentTicketsCard';
import { RecentLogsCard } from '@/components/entity/RecentLogsCard';
import { DashboardSummaryCard } from '@/components/entity/DashboardSummaryCard';
import { WindowSelector, normalizeDashboardWindow } from '@/components/entity/WindowSelector';
import NotificationComposerModal, { type NotificationPayload } from '@/components/notifications/NotificationComposerModal';
import { isAgentOnlineNow } from '@/utils/agentStatus';
import { TransferBeforeDeleteModal } from '@/components/agents/TransferBeforeDeleteModal';
import { ensureArray } from '@/utils/ensureArray';
import { AlertScopeType } from '@/api';
import type { Site, Agent, Ticket, LogEntry } from '@/api';
import type { DashboardWindow } from '@/api/dashboard';
import toast from 'react-hot-toast';

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

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
  const [notifyOpen, setNotifyOpen] = useState(false);

  const client = useClient(id!);
  const sites = useSites(id!);
  const agents = useAgentsByClient(id!);
  const tickets = useTicketsByClient(id!);
  const logs = useLogs({ clientId: id, limit: 8 });
  const softwareSnapshot = useSoftwareInventorySnapshot('client', id);
  const now = useNowTick(5_000);
  const deleteClient = useDeleteClient();
  const sendScopeNotification = useSendScopeNotification();
  const { hasAnyPermission } = useAuthorization();
  // Enviar notificação é uma ação de execução no endpoint (Agents.Execute).
  const canNotifyAgents = hasAnyPermission(['Agents.Execute', 'Agents.Edit', 'agents.*', 'admin.*']);
  const clientDashboard = useDashboardSummary({ clientId: id! }, range, { enabled: !!id });

  // Subscribe to client-scoped NATS dashboard events for targeted refetch.
  useDashboardRealtime({ clientId: id! }, range, !!id);

  // Memoized normalized arrays — MUST be before any early return (Rules of Hooks)
  const sitesArray = useMemo(() => ensureArray<Site>(sites.data), [sites.data]);
  const agentsArray = useMemo(() => ensureArray<Agent>(agents.data), [agents.data]);
  const ticketsArray = useMemo(() => ensureArray<Ticket>(tickets.data), [tickets.data]);
  const logsArray = useMemo(() => ensureArray<LogEntry>(logs.data), [logs.data]);

  const siteAgentStats = useMemo(() => {
    const map = new Map<string, { total: number; online: number }>();
    for (const agent of agentsArray) {
      const entry = map.get(agent.siteId) ?? { total: 0, online: 0 };
      entry.total += 1;
      if (isAgentOnlineNow(agent, now)) entry.online += 1;
      map.set(agent.siteId, entry);
    }
    return map;
  }, [agentsArray, now]);

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

  const handleNotifyConfirm = async (data: NotificationPayload) => {
    const result = await sendScopeNotification.mutateAsync({
      scopeType: AlertScopeType.Client,
      scopeClientId: c.id,
      title: data.title,
      message: data.message,
      alertType: data.alertType,
      timeoutSeconds: data.timeoutSeconds,
      icon: data.icon,
    });

    const failed = result.failedCount > 0 ? ` (${result.failedCount} falha(s))` : '';
    toast.success(
      `Notificação enviada para ${result.dispatchedCount} de ${result.totalAgents} agente(s) do cliente${failed}.`,
    );
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
        breadcrumb={
          <>
            <Link to="/clients" className="hover:text-foreground hover:underline">
              Clientes
            </Link>
            <span className="mx-1.5 text-muted/60">/</span>
            <span className="text-muted-foreground">{c.name}</span>
          </>
        }
      >
        <Badge color={c.isActive ? 'success' : 'slate'}>{c.isActive ? 'Ativo' : 'Inativo'}</Badge>
        <WindowSelector value={range} onChange={handleWindowChange} />
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setNotifyOpen(true)}
          disabled={totalAgents === 0 || !canNotifyAgents}
          title={
            !canNotifyAgents
              ? 'Sem permissão para executar ações nos agentes'
              : totalAgents === 0
                ? 'Nenhum agente neste cliente'
                : 'Enviar notificação para todos os agentes'
          }
        >
          <Bell className="h-4 w-4" /> Notificar
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => navigate(`/knowledge?clientId=${c.id}`)}
        >
          <BookOpen className="h-4 w-4" /> Conhecimento
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setEditClientOpen(true)}>
          <Pencil className="h-4 w-4" /> Editar
        </Button>
        <Button
          variant="danger"
          size="sm"
          onClick={handleDelete}
          aria-label="Excluir cliente"
          title="Excluir cliente"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </PageHeader>

      {/* Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Monitor}
          label="Agentes"
          value={agents.isLoading ? '—' : totalAgents}
          tone="primary"
          onClick={() => scrollToSection('client-agents')}
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
          onClick={() => scrollToSection('client-sites')}
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
          onClick={() => scrollToSection('client-software')}
        />
        <StatCard
          icon={TicketIcon}
          label="Chamados"
          value={tickets.isLoading ? '—' : totalTickets}
          tone="warning"
          onClick={() => scrollToSection('client-tickets')}
        />
      </div>

      {/* Mini-dashboard do cliente */}
      <section id="client-dashboard">
        {clientDashboard.data ? (
          <DashboardSummaryCard
            data={clientDashboard.data}
            title="Resumo do Cliente"
            subtitle={`Agregado da janela ${range}`}
          />
        ) : clientDashboard.isLoading ? (
          <Card>
            <CardHeader title="Resumo do Cliente" subtitle={`Agregado da janela ${range}`} />
            <p className="text-sm text-muted">Carregando resumo...</p>
          </Card>
        ) : (
          <Card>
            <CardHeader title="Resumo do Cliente" subtitle={`Agregado da janela ${range}`} />
            <p className="text-sm text-muted">Não foi possível carregar o resumo desta janela.</p>
          </Card>
        )}
      </section>

      {/* Notas + Informações */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <NotesPanel entityType="client" entityId={c.id} title="Notas do Cliente" />
        </div>

        <Card>
          <CardHeader title="Informações" />
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-muted">Status</dt>
              <dd className="mt-0.5 text-foreground">{c.isActive ? 'Ativo' : 'Inativo'}</dd>
            </div>
            <div>
              <dt className="text-muted">Observações</dt>
              <dd className="mt-0.5 whitespace-pre-wrap text-foreground">{c.notes ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-muted">Criado em</dt>
              <dd className="mt-0.5 text-foreground">{new Date(c.createdAt).toLocaleDateString('pt-BR')}</dd>
            </div>
            <div>
              <dt className="text-muted">Atualizado em</dt>
              <dd className="mt-0.5 text-foreground">{new Date(c.updatedAt).toLocaleDateString('pt-BR')}</dd>
            </div>
            <div className="border-t border-border pt-3" id="client-software">
              <dt className="text-muted">Inventário de software</dt>
              <dd className="mt-0.5 text-foreground">
                {softwareSnapshot.isLoading
                  ? '—'
                  : `${softwareSnapshot.data?.distinctSoftware ?? 0} softwares distintos em ${softwareSnapshot.data?.distinctAgents ?? 0} agente(s)`}
              </dd>
            </div>
          </dl>
        </Card>
      </div>

      {/* Sites + Chamados + Logs */}
      <div className="grid gap-6 lg:grid-cols-3">
        <section id="client-sites">
          <Card className="h-full">
            <CardHeader
              title="Sites"
              subtitle={`${totalSites} total · ${activeSites} ativo(s)`}
              action={
                <Button size="sm" variant="ghost" onClick={() => setSiteModalOpen(true)} aria-label="Cadastrar site">
                  <Plus className="h-4 w-4" />
                </Button>
              }
            />
            <div className="space-y-2">
              {sitesArray.map((site) => {
                const stats = siteAgentStats.get(site.id);
                return (
                  <div
                    key={site.id}
                    className="flex items-center gap-2 rounded-lg bg-surface-light px-3 py-2 transition-colors hover:bg-surface-hover"
                  >
                    <button
                      type="button"
                      onClick={() => navigate(`/clients/${c.id}/sites/${site.id}`)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded-md"
                      aria-label={`Abrir dashboard do site ${site.name}`}
                    >
                      <Building2 className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">{site.name}</span>
                        <span className="block truncate text-xs text-muted">
                          {stats && stats.total > 0
                            ? `${stats.online}/${stats.total} agentes online`
                            : site.notes || 'Nenhum agente'}
                        </span>
                      </span>
                    </button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setNotesSite(site)}
                      aria-label={`Notas do site ${site.name}`}
                      title="Notas do site"
                    >
                      <StickyNote className="h-4 w-4" />
                    </Button>
                    <Badge color={site.isActive ? 'success' : 'slate'}>{site.isActive ? 'Ativo' : 'Inativo'}</Badge>
                  </div>
                );
              })}
              {sites.isLoading && <p className="text-sm text-muted">Carregando...</p>}
              {totalSites === 0 && !sites.isLoading && (
                <EmptyState
                  icon={Building2}
                  title="Nenhum site cadastrado"
                  description="Cadastre um site para organizar os agentes deste cliente."
                  action={{ label: 'Cadastrar site', onClick: () => setSiteModalOpen(true) }}
                  className="py-8"
                />
              )}
            </div>
          </Card>
        </section>

        <section id="client-tickets">
          <RecentTicketsCard
            tickets={recentTickets}
            total={totalTickets}
            isLoading={tickets.isLoading}
            onSelect={(ticket) => navigate(`/tickets/${ticket.id}`)}
            onViewAll={() => navigate('/tickets')}
          />
        </section>

        <section id="client-logs">
          <RecentLogsCard
            logs={recentLogs}
            total={logsArray.length}
            isLoading={logs.isLoading}
            onViewAll={() => navigate('/logs')}
          />
        </section>
      </div>

      {/* Agents */}
      <section id="client-agents">
        <Card>
          <CardHeader
            title="Agentes"
            subtitle={`${onlineAgents} de ${totalAgents} online`}
            action={
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => navigate('/agents')}>
                  <Users className="h-4 w-4" /> Gerenciar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setDeployModalOpen(true)}
                  aria-label="Criar token de deploy"
                  title="Criar token de deploy"
                >
                  <KeyRound className="h-4 w-4" /> Deploy
                </Button>
              </div>
            }
          />
          {totalAgents === 0 && !agents.isLoading ? (
            <EmptyState
              icon={Monitor}
              title="Nenhum agente neste cliente"
              description="Gere um token de deploy para instalar o agente nas máquinas."
              action={{ label: 'Criar token de deploy', onClick: () => setDeployModalOpen(true) }}
              className="py-8"
            />
          ) : (
            <AgentMiniList
              agents={agentsArray}
              now={now}
              isLoading={agents.isLoading}
              emptyMessage="Nenhum agente"
              filterable
              onSelect={(agent) => navigate(`/agents/${agent.id}`)}
            />
          )}
        </Card>
      </section>

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

      {notifyOpen && (
        <NotificationComposerModal
          heading="Notificar agentes do cliente"
          targetLabel={c.name}
          targetHint={`${totalAgents} agente(s) neste cliente`}
          recipientCount={totalAgents}
          recipientScopeLabel="este cliente"
          showSuccessToast={false}
          onClose={() => setNotifyOpen(false)}
          onConfirm={handleNotifyConfirm}
          isLoading={sendScopeNotification.isPending}
        />
      )}
    </div>
  );
}
