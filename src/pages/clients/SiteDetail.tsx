import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Activity,
  AlertTriangle,
  AppWindow,
  Building2,
  CheckCircle2,
  Monitor,
  Ticket as TicketIcon,
  Trash2,
  XCircle,
} from 'lucide-react';
import { useClient } from '@/hooks/useClients';
import { useSite, useDeleteSite } from '@/hooks/useSites';
import { useAgentsBySite } from '@/hooks/useAgents';
import { TransferBeforeDeleteModal } from '@/components/agents/TransferBeforeDeleteModal';
import { useTicketsByClient } from '@/hooks/useTickets';
import { useLogs } from '@/hooks/useLogs';
import { useDashboardSummary } from '@/hooks/useDashboardSummary';
import { useDashboardRealtime } from '@/hooks/useDashboardRealtime';
import { useNowTick } from '@/hooks/useNowTick';
import { useSoftwareInventorySnapshot } from '@/hooks/useSoftwareInventory';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ErrorDisplay,
  Loading,
  StatCard,
} from '@/components/ui';
import { NotesPanel } from '@/components/notes/NotesPanel';
import { isAgentOnlineNow } from '@/utils/agentStatus';
import { LogLevel, type TicketPriority } from '@/api';
import toast from 'react-hot-toast';
import type { DashboardWindow } from '@/api/dashboard';

const priorityLabels: Record<
  TicketPriority,
  { label: string; color: 'slate' | 'success' | 'warning' | 'danger' }
> = {
  Low: { label: 'Baixa', color: 'slate' },
  Medium: { label: 'Média', color: 'success' },
  High: { label: 'Alta', color: 'warning' },
  Critical: { label: 'Crítica', color: 'danger' },
};

const levelLabels: Record<
  number,
  { label: string; color: 'slate' | 'primary' | 'warning' | 'danger' | 'accent' }
> = {
  [LogLevel.Debug]: { label: 'Debug', color: 'slate' },
  [LogLevel.Info]: { label: 'Info', color: 'primary' },
  [LogLevel.Warning]: { label: 'Aviso', color: 'warning' },
  [LogLevel.Error]: { label: 'Erro', color: 'danger' },
  [LogLevel.Critical]: { label: 'Crítico', color: 'danger' },
};

const WINDOWS: { value: DashboardWindow; label: string }[] = [
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
];

function normalizeWindow(value: string | null): DashboardWindow {
  if (value === '7d' || value === '30d') return value;
  return '24h';
}

export default function SiteDetail() {
  const { id: clientId, siteId } = useParams<{ id: string; siteId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [window, setWindow] = useState<DashboardWindow>(() =>
    normalizeWindow(searchParams.get('window')),
  );

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
    window,
    { enabled: !!clientId && !!siteId },
  );
  const now = useNowTick(5_000);

  useDashboardRealtime(
    { clientId: clientId!, siteId: siteId! },
    window,
    !!clientId && !!siteId,
  );

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
  const siteTickets = (tickets.data ?? []).filter((ticket) => ticket.siteId === currentSite.id);
  const recentTickets = siteTickets.slice(0, 8);
  const recentLogs = (logs.data ?? []).slice(0, 8);
  const totalAgents = agents.data?.length ?? 0;
  const onlineAgents = (agents.data ?? []).filter((agent) => isAgentOnlineNow(agent, now)).length;
  const totalTickets = siteTickets.length;
  const totalInstalledSoftware = softwareSnapshot.data?.totalInstalled ?? 0;

  const handleWindowChange = (value: DashboardWindow) => {
    setWindow(value);
    const next = new URLSearchParams(searchParams);
    if (value === '24h') {
      next.delete('window');
    } else {
      next.set('window', value);
    }
    setSearchParams(next, { replace: true });
  };

  const handleDelete = () => {
    const agentList = agents.data ?? [];
    if (agentList.length > 0) {
      setTransferModalOpen(true);
    } else {
      if (!confirm(`Tem certeza que deseja excluir o site "${currentSite.name}"?`)) return;
      deleteSite.mutate(
        { clientId: currentClient.id, id: currentSite.id },
        {
          onSuccess: () => {
            toast.success('Site excluído com sucesso');
            navigate(`/clients/${currentClient.id}`);
          },
          onError: () => toast.error('Erro ao excluir site'),
        },
      );
    }
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
        onError: () => toast.error('Erro ao excluir site após transferência'),
      },
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={() => navigate(`/clients/${currentClient.id}`)}>
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Button>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-foreground">{currentSite.name}</h1>
              <Badge color={currentSite.isActive ? 'success' : 'slate'}>
                {currentSite.isActive ? 'Ativo' : 'Inativo'}
              </Badge>
            </div>
            <p className="text-sm text-muted">Cliente: {currentClient.name}</p>
          </div>
        </div>
        <div className="inline-flex w-fit rounded-xl border border-border bg-surface-light p-1">
          {WINDOWS.map((item) => {
            const active = item.value === window;
            return (
              <button
                key={item.value}
                type="button"
                onClick={() => handleWindowChange(item.value)}
                className={[
                  'rounded-lg px-3 py-1.5 text-sm transition-colors',
                  active
                    ? 'bg-primary text-foreground shadow-sm'
                    : 'text-muted hover:text-foreground',
                ].join(' ')}
              >
                {item.label}
              </button>
            );
          })}
        </div>
        <Button variant="danger" size="sm" onClick={handleDelete}>
          <Trash2 className="h-4 w-4" /> Excluir
        </Button>
      </div>

      {dashboard.data && (
        <Card>
          <CardHeader title="Dashboard do Site" subtitle={`Agregado da janela ${window}`} />
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div className="rounded-lg bg-surface-light px-3 py-2">
              <div className="flex items-center gap-1.5 text-muted">
                <Monitor className="h-3.5 w-3.5" />
                <span>Agentes</span>
              </div>
              <p className="mt-1 text-base font-semibold text-foreground">
                {dashboard.data.agents.online}
                <span className="text-xs font-normal text-muted">
                  /{dashboard.data.agents.total} online
                </span>
              </p>
              {dashboard.data.agents.error > 0 && (
                <p className="mt-0.5 flex items-center gap-1 text-xs text-danger">
                  <AlertTriangle className="h-3 w-3" />
                  {dashboard.data.agents.error} em erro
                </p>
              )}
            </div>
            <div className="rounded-lg bg-surface-light px-3 py-2">
              <div className="flex items-center gap-1.5 text-muted">
                <TicketIcon className="h-3.5 w-3.5" />
                <span>Chamados</span>
              </div>
              <p className="mt-1 text-base font-semibold text-foreground">
                {dashboard.data.tickets.open}
                <span className="text-xs font-normal text-muted"> abertos</span>
              </p>
              {dashboard.data.tickets.slaBreachedOpen > 0 && (
                <p className="mt-0.5 flex items-center gap-1 text-xs text-danger">
                  <AlertTriangle className="h-3 w-3" />
                  {dashboard.data.tickets.slaBreachedOpen} SLA violado
                </p>
              )}
            </div>
            <div className="rounded-lg bg-surface-light px-3 py-2">
              <div className="flex items-center gap-1.5 text-muted">
                <Activity className="h-3.5 w-3.5" />
                <span>Comandos</span>
              </div>
              <p
                className={`mt-1 text-base font-semibold ${
                  dashboard.data.commands.total > 0 && dashboard.data.commands.successRate >= 80
                    ? 'text-success'
                    : dashboard.data.commands.total > 0
                      ? 'text-danger'
                      : 'text-foreground'
                }`}
              >
                {dashboard.data.commands.total > 0
                  ? `${dashboard.data.commands.successRate.toFixed(1)}% sucesso`
                  : '—'}
              </p>
              <p className="mt-0.5 text-xs text-muted">
                {dashboard.data.commands.total} total
              </p>
            </div>
            <div className="rounded-lg bg-surface-light px-3 py-2">
              <div className="flex items-center gap-1.5 text-muted">
                {dashboard.data.automation.failed > 0 ? (
                  <XCircle className="h-3.5 w-3.5 text-danger" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                )}
                <span>Automação</span>
              </div>
              <p
                className={`mt-1 text-base font-semibold ${
                  dashboard.data.automation.total > 0 &&
                  dashboard.data.automation.successRate >= 80
                    ? 'text-success'
                    : dashboard.data.automation.total > 0
                      ? 'text-danger'
                      : 'text-foreground'
                }`}
              >
                {dashboard.data.automation.total > 0
                  ? `${dashboard.data.automation.successRate.toFixed(1)}% sucesso`
                  : '—'}
              </p>
              <p className="mt-0.5 text-xs text-muted">
                {dashboard.data.automation.total} execuções
              </p>
            </div>
          </div>
        </Card>
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
          label={`Logs ${window}`}
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

        <Card>
          <CardHeader
            title="Chamados Recentes"
            subtitle={`${totalTickets} total`}
            action={
              <Button size="sm" variant="ghost" onClick={() => navigate('/tickets')}>
                Ver todos
              </Button>
            }
          />
          <div className="space-y-2">
            {recentTickets.map((ticket) => {
              const priority = priorityLabels[ticket.priority] ?? {
                label: '?',
                color: 'slate' as const,
              };
              return (
                <div
                  key={ticket.id}
                  onClick={() => navigate(`/tickets/${ticket.id}`)}
                  className="flex cursor-pointer items-center gap-3 rounded-lg bg-surface-light px-3 py-2 transition-colors hover:bg-surface-hover"
                >
                  <TicketIcon className="h-4 w-4 shrink-0 text-warning" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{ticket.title}</p>
                    <p className="text-xs text-muted">{ticket.category ?? 'Sem categoria'}</p>
                  </div>
                  <Badge color={priority.color}>{priority.label}</Badge>
                </div>
              );
            })}
            {tickets.isLoading && <p className="text-sm text-muted">Carregando...</p>}
            {totalTickets === 0 && !tickets.isLoading && (
              <p className="text-sm text-muted">Nenhum chamado neste site</p>
            )}
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <Card>
            <CardHeader title="Agentes do Site" subtitle={`${onlineAgents} online`} />
            <div className="space-y-2">
              {(agents.data ?? []).map((agent) => {
                const online = isAgentOnlineNow(agent, now);
                return (
                  <div
                    key={agent.id}
                    onClick={() => navigate(`/agents/${agent.id}`)}
                    className="flex cursor-pointer items-center gap-3 rounded-lg bg-surface-light px-3 py-2 transition-colors hover:bg-surface-hover"
                  >
                    <Monitor className="h-4 w-4 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {agent.displayName ?? agent.hostname}
                      </p>
                      <p className="text-xs text-muted">{agent.operatingSystem ?? 'N/A'}</p>
                    </div>
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${online ? 'bg-success' : 'bg-slate-600'}`}
                    />
                  </div>
                );
              })}
              {agents.isLoading && <p className="text-sm text-muted">Carregando...</p>}
              {totalAgents === 0 && !agents.isLoading && (
                <p className="text-sm text-muted">Nenhum agente neste site</p>
              )}
            </div>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card>
            <CardHeader
              title="Logs Recentes"
              action={
                <Button size="sm" variant="ghost" onClick={() => navigate('/logs')}>
                  Ver todos
                </Button>
              }
            />
            <div className="space-y-2">
              {recentLogs.map((log) => {
                const level = levelLabels[log.level] ?? {
                  label: '?',
                  color: 'slate' as const,
                };
                return (
                  <div key={log.id} className="flex items-start gap-2 rounded-lg bg-surface-light px-3 py-2">
                    <Badge color={level.color} className="mt-0.5 shrink-0">
                      {level.label}
                    </Badge>
                    <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{log.message}</p>
                  </div>
                );
              })}
              {logs.isLoading && <p className="text-sm text-muted">Carregando...</p>}
              {(logs.data?.length ?? 0) === 0 && !logs.isLoading && (
                <p className="text-sm text-muted">Nenhum log registrado neste site</p>
              )}
            </div>
          </Card>
        </div>
      </div>

      <TransferBeforeDeleteModal
        open={transferModalOpen}
        onClose={() => setTransferModalOpen(false)}
        entityType="site"
        entityName={currentSite.name}
        agentIds={(agents.data ?? []).map((a) => a.id)}
        sourceClientId={currentClient.id}
        onSuccess={handleTransferAndDelete}
      />
    </div>
  );
}
