import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AppWindow, Monitor, Pencil, Ticket as TicketIcon, Trash2, Bell, BookOpen, ScrollText, Users } from 'lucide-react';
import { useClient } from '@/hooks/useClients';
import { useSite, useDeleteSite } from '@/hooks/useSites';
import { useAgentsBySite } from '@/hooks/useAgents';
import { useTicketsBySite } from '@/hooks/useTickets';
import { useLogs } from '@/hooks/useLogs';
import { useDashboardSummary } from '@/hooks/useDashboardSummary';
import { useDashboardRealtime } from '@/hooks/useDashboardRealtime';
import { useNowTick } from '@/hooks/useNowTick';
import { useSoftwareInventorySnapshot } from '@/hooks/useSoftwareInventory';
import { useSendScopeNotification } from '@/hooks/useAgentAlerts';
import { useAuthorization } from '@/auth/authorization';
import { Badge, Button, Card, CardHeader, ConfirmDialog, ErrorDisplay, Loading, PageHeader, StatCard, EmptyState } from '@/components/ui';
import { NotesPanel } from '@/components/notes/NotesPanel';
import { AgentMiniList } from '@/components/entity/AgentMiniList';
import { RecentTicketsCard } from '@/components/entity/RecentTicketsCard';
import { RecentLogsCard } from '@/components/entity/RecentLogsCard';
import { DashboardSummaryCard } from '@/components/entity/DashboardSummaryCard';
import { WindowSelector, normalizeDashboardWindow } from '@/components/entity/WindowSelector';
import { SiteFormModal } from '@/components/entity/SiteFormModal';
import NotificationComposerModal, { type NotificationPayload } from '@/components/notifications/NotificationComposerModal';
import { TransferBeforeDeleteModal } from '@/components/agents/TransferBeforeDeleteModal';
import { isAgentOnlineNow } from '@/utils/agentStatus';
import { ensureArray } from '@/utils/ensureArray';
import { AlertScopeType } from '@/api';
import type { Agent, Ticket, LogEntry } from '@/api';
import type { DashboardWindow } from '@/api/dashboard';
import toast from 'react-hot-toast';

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

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
  const [notifyOpen, setNotifyOpen] = useState(false);

  const client = useClient(clientId!);
  const site = useSite(clientId!, siteId!);
  const agents = useAgentsBySite(siteId!);
  const deleteSite = useDeleteSite();
  const tickets = useTicketsBySite(siteId!);
  const logs = useLogs({ siteId, limit: 8 });
  const softwareSnapshot = useSoftwareInventorySnapshot('site', undefined, siteId);
  const dashboard = useDashboardSummary(
    { clientId: clientId!, siteId: siteId! },
    range,
    { enabled: !!clientId && !!siteId },
  );
  const now = useNowTick(5_000);
  const sendScopeNotification = useSendScopeNotification();
  const { hasAnyPermission } = useAuthorization();
  // Enviar notificação é uma ação de execução no endpoint (Agents.Execute).
  const canNotifyAgents = hasAnyPermission(['Agents.Execute', 'Agents.Edit', 'agents.*', 'admin.*']);

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

  const recentTickets = ticketsArray.slice(0, 8);
  const recentLogs = logsArray.slice(0, 8);
  const totalAgents = agentsArray.length;
  const onlineAgents = agentsArray.filter((agent) => isAgentOnlineNow(agent, now)).length;
  const totalTickets = ticketsArray.length;
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

  const handleNotifyConfirm = async (data: NotificationPayload) => {
    const result = await sendScopeNotification.mutateAsync({
      scopeType: AlertScopeType.Site,
      scopeClientId: currentClient.id,
      scopeSiteId: currentSite.id,
      title: data.title,
      message: data.message,
      alertType: data.alertType,
      timeoutSeconds: data.timeoutSeconds,
      icon: data.icon,
    });

    const failed = result.failedCount > 0 ? ` (${result.failedCount} falha(s))` : '';
    toast.success(
      `Notificação enviada para ${result.dispatchedCount} de ${result.totalAgents} agente(s) do site${failed}.`,
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={currentSite.name}
        description={`Cliente: ${currentClient.name}`}
        onBack={() => navigate(`/clients/${currentClient.id}`)}
        backLabel="Voltar para o cliente"
        breadcrumb={
          <>
            <Link to="/clients" className="hover:text-foreground hover:underline">
              Clientes
            </Link>
            <span className="mx-1.5 text-muted/60">/</span>
            <Link
              to={`/clients/${currentClient.id}`}
              className="hover:text-foreground hover:underline"
            >
              {currentClient.name}
            </Link>
            <span className="mx-1.5 text-muted/60">/</span>
            <span className="text-muted-foreground">{currentSite.name}</span>
          </>
        }
      >
        <Badge color={currentSite.isActive ? 'success' : 'slate'}>
          {currentSite.isActive ? 'Ativo' : 'Inativo'}
        </Badge>
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
                ? 'Nenhum agente neste site'
                : 'Enviar notificação para todos os agentes do site'
          }
        >
          <Bell className="h-4 w-4" /> Notificar
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => navigate(`/knowledge?clientId=${currentClient.id}`)}
        >
          <BookOpen className="h-4 w-4" /> Conhecimento
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setEditSiteOpen(true)}>
          <Pencil className="h-4 w-4" /> Editar
        </Button>
        <Button
          variant="danger"
          size="sm"
          onClick={handleDelete}
          aria-label="Excluir site"
          title="Excluir site"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Monitor}
          label="Agentes"
          value={agents.isLoading ? '—' : totalAgents}
          tone="primary"
          onClick={() => scrollToSection('site-agents')}
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
          value={dashboard.isLoading ? (tickets.isLoading ? '—' : totalTickets) : dashboard.data?.tickets.open ?? totalTickets}
          tone="warning"
          onClick={() => scrollToSection('site-tickets')}
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
          onClick={() => scrollToSection('site-software')}
        />
        <StatCard
          icon={ScrollText}
          label={`Logs ${range}`}
          value={dashboard.isLoading ? (logs.isLoading ? '—' : recentLogs.length) : dashboard.data?.logs.total ?? recentLogs.length}
          tone="accent"
          onClick={() => scrollToSection('site-logs')}
        />
      </div>

      <section id="site-dashboard">
        {dashboard.data ? (
          <DashboardSummaryCard
            data={dashboard.data}
            title="Dashboard do Site"
            subtitle={`Agregado da janela ${range}`}
          />
        ) : dashboard.isLoading ? (
          <Card>
            <CardHeader title="Dashboard do Site" subtitle={`Agregado da janela ${range}`} />
            <p className="text-sm text-muted">Carregando resumo...</p>
          </Card>
        ) : (
          <Card>
            <CardHeader title="Dashboard do Site" subtitle={`Agregado da janela ${range}`} />
            <p className="text-sm text-muted">Não foi possível carregar o resumo desta janela.</p>
          </Card>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <NotesPanel entityType="site" entityId={currentSite.id} title="Notas do Site" />
        </div>

        <Card>
          <CardHeader title="Informações do Site" />
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-muted">Cliente</dt>
              <dd className="mt-0.5">
                <Link
                  to={`/clients/${currentClient.id}`}
                  className="text-primary hover:underline"
                >
                  {currentClient.name}
                </Link>
              </dd>
            </div>
            <div>
              <dt className="text-muted">Status</dt>
              <dd className="mt-0.5 text-foreground">{currentSite.isActive ? 'Ativo' : 'Inativo'}</dd>
            </div>
            <div>
              <dt className="text-muted">Observações</dt>
              <dd className="mt-0.5 whitespace-pre-wrap text-foreground">{currentSite.notes ?? '—'}</dd>
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
            <div className="border-t border-border pt-3" id="site-software">
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

      <div className="grid gap-6 lg:grid-cols-2">
        <section id="site-tickets">
          <RecentTicketsCard
            tickets={recentTickets}
            total={totalTickets}
            isLoading={tickets.isLoading}
            emptyMessage="Nenhum chamado neste site"
            onSelect={(ticket) => navigate(`/tickets/${ticket.id}`)}
            onViewAll={() => navigate('/tickets')}
          />
        </section>

        <section id="site-logs">
          <RecentLogsCard
            logs={recentLogs}
            total={logsArray.length}
            isLoading={logs.isLoading}
            emptyMessage="Nenhum log registrado neste site"
            onViewAll={() => navigate('/logs')}
          />
        </section>
      </div>

      <section id="site-agents">
        <Card>
          <CardHeader
            title="Agentes do Site"
            subtitle={`${onlineAgents} de ${totalAgents} online`}
            action={
              <Button size="sm" variant="ghost" onClick={() => navigate('/agents')}>
                <Users className="h-4 w-4" /> Gerenciar
              </Button>
            }
          />
          {totalAgents === 0 && !agents.isLoading ? (
            <EmptyState
              icon={Monitor}
              title="Nenhum agente neste site"
              description="Gere um token de deploy no cliente para instalar agentes neste site."
              action={{ label: 'Ver tokens de deploy', onClick: () => navigate('/deploy') }}
              className="py-8"
            />
          ) : (
            <AgentMiniList
              agents={agentsArray}
              now={now}
              isLoading={agents.isLoading}
              emptyMessage="Nenhum agente neste site"
              filterable
              onSelect={(agent) => navigate(`/agents/${agent.id}`)}
            />
          )}
        </Card>
      </section>

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

      {notifyOpen && (
        <NotificationComposerModal
          heading="Notificar agentes do site"
          targetLabel={currentSite.name}
          targetHint={`${totalAgents} agente(s) neste site`}
          recipientCount={totalAgents}
          recipientScopeLabel="este site"
          showSuccessToast={false}
          onClose={() => setNotifyOpen(false)}
          onConfirm={handleNotifyConfirm}
          isLoading={sendScopeNotification.isPending}
        />
      )}
    </div>
  );
}
