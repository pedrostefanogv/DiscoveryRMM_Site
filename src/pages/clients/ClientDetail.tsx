import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Monitor, Trash2, AppWindow, Building2, Ticket as TicketIcon, Copy, KeyRound, BookOpen, CheckCircle2, XCircle, AlertTriangle, Activity } from 'lucide-react';
import { useClient, useDeleteClient } from '@/hooks/useClients';
import { useSites, useCreateSite } from '@/hooks/useSites';
import { useAgentsByClient } from '@/hooks/useAgents';
import { useTicketsByClient } from '@/hooks/useTickets';
import { useLogs } from '@/hooks/useLogs';
import { useCreateDeployToken } from '@/hooks/useDeployTokens';
import { useDashboardSummary } from '@/hooks/useDashboardSummary';
import { useDashboardRealtime } from '@/hooks/useDashboardRealtime';
import { Button, Card, CardHeader, Badge, Loading, ErrorDisplay, Modal, Input, TextArea, StatCard, Select } from '@/components/ui';
import { NotesPanel } from '@/components/notes/NotesPanel';
import { isAgentOnlineNow } from '@/utils/agentStatus';
import { useNowTick } from '@/hooks/useNowTick';
import { useSoftwareInventorySnapshot } from '@/hooks/useSoftwareInventory';
import { LogLevel, type TicketPriority, type Site } from '@/api';
import { TransferBeforeDeleteModal } from '@/components/agents/TransferBeforeDeleteModal';
import toast from 'react-hot-toast';

const priorityLabels: Record<TicketPriority, { label: string; color: 'slate' | 'success' | 'warning' | 'danger' }> = {
  Low: { label: 'Baixa', color: 'slate' },
  Medium: { label: 'Média', color: 'success' },
  High: { label: 'Alta', color: 'warning' },
  Critical: { label: 'Crítica', color: 'danger' },
};

const levelLabels: Record<number, { label: string; color: 'slate' | 'primary' | 'warning' | 'danger' | 'accent' }> = {
  [LogLevel.Debug]: { label: 'Debug', color: 'slate' },
  [LogLevel.Info]: { label: 'Info', color: 'primary' },
  [LogLevel.Warning]: { label: 'Aviso', color: 'warning' },
  [LogLevel.Error]: { label: 'Erro', color: 'danger' },
  [LogLevel.Critical]: { label: 'Crítico', color: 'danger' },
};

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [siteModalOpen, setSiteModalOpen] = useState(false);
  const [siteName, setSiteName] = useState('');
  const [siteNotes, setSiteNotes] = useState('');
  const [notesSite, setNotesSite] = useState<Site | null>(null);
  const [deployModalOpen, setDeployModalOpen] = useState(false);
  const [deploySiteId, setDeploySiteId] = useState('');
  const [deployDescription, setDeployDescription] = useState('');
  const [deployExpiresInHours, setDeployExpiresInHours] = useState<number | null>(24);
  const [deployMultiUse, setDeployMultiUse] = useState(false);
  const [transferModalOpen, setTransferModalOpen] = useState(false);

  const client = useClient(id!);
  const sites = useSites(id!);
  const agents = useAgentsByClient(id!);
  const tickets = useTicketsByClient(id!);
  const logs = useLogs({ clientId: id, limit: 8 });
  const softwareSnapshot = useSoftwareInventorySnapshot('client', id);
  const now = useNowTick(5_000);
  const deleteClient = useDeleteClient();
  const createSite = useCreateSite();
  const createDeployToken = useCreateDeployToken();
  const clientDashboard = useDashboardSummary(
    { clientId: id! },
    '24h',
    { enabled: !!id },
  );

  // Subscribe to client-scoped NATS dashboard events for targeted refetch.
  useDashboardRealtime({ clientId: id! }, '24h', !!id);

  if (client.isLoading) return <Loading />;
  if (client.isError || !client.data) return <ErrorDisplay onRetry={() => client.refetch()} />;

  const c = client.data;

  const handleDelete = () => {
    const agentList = agents.data ?? [];
    if (agentList.length > 0) {
      setTransferModalOpen(true);
    } else {
      if (!confirm('Tem certeza que deseja excluir este cliente?')) return;
      deleteClient.mutate(c.id, {
        onSuccess: () => { toast.success('Cliente excluído'); navigate('/clients'); },
        onError: () => toast.error('Erro ao excluir'),
      });
    }
  };

  const handleTransferAndDelete = () => {
    setTransferModalOpen(false);
    deleteClient.mutate(c.id, {
      onSuccess: () => { toast.success('Cliente excluído'); navigate('/clients'); },
      onError: () => toast.error('Erro ao excluir cliente após transferência'),
    });
  };

  const handleCreateSite = () => {
    if (!siteName.trim()) {
      toast.error('Informe o nome do site');
      return;
    }
    createSite.mutate(
      { clientId: c.id, data: { name: siteName.trim(), notes: siteNotes.trim() || null } },
      {
        onSuccess: () => {
          toast.success('Site cadastrado com sucesso');
          setSiteModalOpen(false);
          setSiteName('');
          setSiteNotes('');
        },
        onError: () => toast.error('Erro ao cadastrar site'),
      },
    );
  };

  const totalSites = sites.data?.length ?? 0;
  const activeSitesList = (sites.data ?? []).filter((s) => s.isActive);
  const activeSites = activeSitesList.length;
  const totalAgents = agents.data?.length ?? 0;
  const onlineAgents = (agents.data ?? []).filter((a) => isAgentOnlineNow(a, now)).length;
  const totalInstalledSoftware = softwareSnapshot.data?.totalInstalled ?? 0;
  const totalTickets = tickets.data?.length ?? 0;
  const recentTickets = (tickets.data ?? []).slice(0, 6);
  const recentLogs = (logs.data ?? []).slice(0, 8);
  const generatedDeployToken =
    createDeployToken.data && 'token' in createDeployToken.data
      ? createDeployToken.data
      : null;

  const resetDeployModal = () => {
    setDeployModalOpen(false);
    setDeploySiteId('');
    setDeployDescription('');
    setDeployExpiresInHours(24);
    setDeployMultiUse(false);
    createDeployToken.reset();
  };

  const handleCreateDeployToken = () => {
    if (!deploySiteId) {
      toast.error('Selecione o site para gerar o token');
      return;
    }

    createDeployToken.mutate(
      {
        clientId: c.id,
        siteId: deploySiteId,
        description: deployDescription.trim() ? deployDescription.trim() : null,
        expiresInHours: deployExpiresInHours,
        multiUse: deployMultiUse,
        delivery: 'token',
      },
      {
        onSuccess: () => {
          toast.success('Token de deploy criado com sucesso');
        },
        onError: () => {
          toast.error('Erro ao criar token de deploy');
        },
      },
    );
  };

  const handleCopyDeployToken = async () => {
    if (!generatedDeployToken?.token) return;
    try {
      await navigator.clipboard.writeText(generatedDeployToken.token);
      toast.success('Token copiado para a area de transferencia');
    } catch {
      toast.error('Não foi possível copiar o token');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/clients')} aria-label="Voltar" className="rounded-lg p-2 text-muted hover:bg-surface-light hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-foreground">{c.name}</h1>
          <p className="text-sm text-muted">Detalhes do Cliente</p>
        </div>
        <Badge color={c.isActive ? 'success' : 'slate'}>{c.isActive ? 'Ativo' : 'Inativo'}</Badge>
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
      </div>

      {/* Mini-dashboard do cliente (últimas 24h) */}
      {clientDashboard.data && (
        <Card>
          <CardHeader
            title="Resumo do Cliente"
            subtitle="Agregado das últimas 24h"
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-sm">
            {/* Agentes */}
            <div className="rounded-lg bg-surface-light px-3 py-2">
              <div className="flex items-center gap-1.5 text-muted">
                <Monitor className="h-3.5 w-3.5" />
                <span>Agentes</span>
              </div>
              <p className="mt-1 text-base font-semibold text-foreground">
                {clientDashboard.data.agents.online}
                <span className="text-xs font-normal text-muted">/{clientDashboard.data.agents.total} online</span>
              </p>
              {clientDashboard.data.agents.error > 0 && (
                <p className="mt-0.5 text-xs text-danger flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />{clientDashboard.data.agents.error} em erro
                </p>
              )}
            </div>
            {/* Chamados */}
            <div className="rounded-lg bg-surface-light px-3 py-2">
              <div className="flex items-center gap-1.5 text-muted">
                <TicketIcon className="h-3.5 w-3.5" />
                <span>Chamados</span>
              </div>
              <p className="mt-1 text-base font-semibold text-foreground">
                {clientDashboard.data.tickets.open}
                <span className="text-xs font-normal text-muted"> abertos</span>
              </p>
              {clientDashboard.data.tickets.slaBreachedOpen > 0 && (
                <p className="mt-0.5 text-xs text-danger flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />{clientDashboard.data.tickets.slaBreachedOpen} SLA violado
                </p>
              )}
            </div>
            {/* Comandos */}
            <div className="rounded-lg bg-surface-light px-3 py-2">
              <div className="flex items-center gap-1.5 text-muted">
                <Activity className="h-3.5 w-3.5" />
                <span>Comandos</span>
              </div>
              <p className={`mt-1 text-base font-semibold ${clientDashboard.data.commands.total > 0 && clientDashboard.data.commands.successRate >= 80 ? 'text-success' : clientDashboard.data.commands.total > 0 ? 'text-danger' : 'text-foreground'}`}>
                {clientDashboard.data.commands.total > 0
                  ? `${clientDashboard.data.commands.successRate.toFixed(1)}% sucesso`
                  : ''}
              </p>
              <p className="mt-0.5 text-xs text-muted">{clientDashboard.data.commands.total} total</p>
            </div>
            {/* Automação */}
            <div className="rounded-lg bg-surface-light px-3 py-2">
              <div className="flex items-center gap-1.5 text-muted">
                {clientDashboard.data.automation.failed > 0
                  ? <XCircle className="h-3.5 w-3.5 text-danger" />
                  : <CheckCircle2 className="h-3.5 w-3.5" />}
                <span>Automação</span>
              </div>
              <p className={`mt-1 text-base font-semibold ${clientDashboard.data.automation.total > 0 && clientDashboard.data.automation.successRate >= 80 ? 'text-success' : clientDashboard.data.automation.total > 0 ? 'text-danger' : 'text-foreground'}`}>
                {clientDashboard.data.automation.total > 0
                  ? `${clientDashboard.data.automation.successRate.toFixed(1)}% sucesso`
                  : ''}
              </p>
              <p className="mt-0.5 text-xs text-muted">{clientDashboard.data.automation.total} execuções</p>
            </div>
          </div>
        </Card>
      )}

      {/* Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Monitor}
          label="Agentes"
          value={agents.isLoading ? '' : totalAgents}
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
          value={sites.isLoading ? '' : totalSites}
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
          value={softwareSnapshot.isLoading ? '' : totalInstalledSoftware}
          tone="success"
        />
        <StatCard
          icon={TicketIcon}
          label="Chamados"
          value={tickets.isLoading ? '' : totalTickets}
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
              <dd className="mt-0.5 text-foreground">{c.notes ?? ''}</dd>
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
                {softwareSnapshot.isLoading ? '' : (softwareSnapshot.data?.distinctSoftware ?? 0)}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Agentes com inventário</dt>
              <dd className="mt-0.5 text-foreground">
                {softwareSnapshot.isLoading ? '' : (softwareSnapshot.data?.distinctAgents ?? 0)}
              </dd>
            </div>
          </dl>
        </Card>

        <div className="lg:col-span-2">
          <NotesPanel
            entityType="client"
            entityId={c.id}
            title="Notas do Cliente"
          />
        </div>

        {/* Sites */}
        <Card>
          <CardHeader
            title="Sites"
            subtitle={`${totalSites} total`}
            action={(
              <Button size="sm" variant="ghost" onClick={() => setSiteModalOpen(true)} aria-label="Cadastrar site">
                <Plus className="h-4 w-4" />
              </Button>
            )}
          />
          <div className="space-y-2">
            {(sites.data ?? []).map(site => (
              <div
                key={site.id}
                onClick={() => navigate(`/clients/${c.id}/sites/${site.id}`)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    navigate(`/clients/${c.id}/sites/${site.id}`);
                  }
                }}
                role="button"
                tabIndex={0}
                className="flex cursor-pointer items-center gap-3 rounded-lg bg-surface-light px-3 py-2 transition-colors hover:bg-surface-hover"
              >
                <Building2 className="h-4 w-4 text-accent shrink-0" />
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

        {/* Chamados Recentes */}
        <Card>
          <CardHeader
            title="Chamados Recentes"
            subtitle={`${totalTickets} total`}
            action={(
              <Button size="sm" variant="ghost" onClick={() => navigate('/tickets')}>
                Ver todos
              </Button>
            )}
          />
          <div className="space-y-2">
            {recentTickets.map(ticket => {
              const p = priorityLabels[ticket.priority] ?? { label: '?', color: 'slate' as const };
              return (
                <div
                  key={ticket.id}
                  onClick={() => navigate(`/tickets/${ticket.id}`)}
                  className="flex cursor-pointer items-center gap-3 rounded-lg bg-surface-light px-3 py-2 hover:bg-surface-hover transition-colors"
                >
                  <TicketIcon className="h-4 w-4 text-warning shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{ticket.title}</p>
                    <p className="text-xs text-muted">{ticket.category ?? 'Sem categoria'}</p>
                  </div>
                  <Badge color={p.color}>{p.label}</Badge>
                </div>
              );
            })}
            {tickets.isLoading && <p className="text-sm text-muted">Carregando...</p>}
            {totalTickets === 0 && !tickets.isLoading && (
              <p className="text-sm text-muted">Nenhum chamado</p>
            )}
          </div>
        </Card>
      </div>

      {/* Bottom grid: Agents + Logs */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* Agentes */}
        <div className="lg:col-span-3">
          <Card>
            <CardHeader
              title="Agentes"
              subtitle={`${onlineAgents} online`}
              action={(
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setDeployModalOpen(true)}
                  aria-label="Criar token de deploy"
                  title="Criar token de deploy"
                >
                  <KeyRound className="h-4 w-4" />
                </Button>
              )}
            />
            <div className="space-y-2">
              {(agents.data ?? []).map(agent => {
                const online = isAgentOnlineNow(agent, now);
                return (
                  <div
                    key={agent.id}
                    onClick={() => navigate(`/agents/${agent.id}`)}
                    className="flex cursor-pointer items-center gap-3 rounded-lg bg-surface-light px-3 py-2 hover:bg-surface-hover transition-colors"
                  >
                    <Monitor className="h-4 w-4 text-primary shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {agent.displayName ?? agent.hostname}
                      </p>
                      <p className="text-xs text-muted">{agent.operatingSystem ?? 'N/A'}</p>
                    </div>
                    <span className={`h-2 w-2 shrink-0 rounded-full ${online ? 'bg-success' : 'bg-slate-600'}`} />
                  </div>
                );
              })}
              {agents.isLoading && <p className="text-sm text-muted">Carregando...</p>}
              {totalAgents === 0 && !agents.isLoading && (
                <p className="text-sm text-muted">Nenhum agente</p>
              )}
            </div>
          </Card>
        </div>

        {/* Logs Recentes */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader
              title="Logs Recentes"
              action={(
                <Button size="sm" variant="ghost" onClick={() => navigate('/logs')}>
                  Ver todos
                </Button>
              )}
            />
            <div className="space-y-2">
              {recentLogs.map(log => {
                const l = levelLabels[log.level] ?? { label: '?', color: 'slate' as const };
                return (
                  <div key={log.id} className="flex items-start gap-2 rounded-lg bg-surface-light px-3 py-2">
                    <Badge color={l.color} className="mt-0.5 shrink-0">{l.label}</Badge>
                    <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{log.message}</p>
                  </div>
                );
              })}
              {logs.isLoading && <p className="text-sm text-muted">Carregando...</p>}
              {(logs.data?.length ?? 0) === 0 && !logs.isLoading && (
                <p className="text-sm text-muted">Nenhum log registrado</p>
              )}
            </div>
          </Card>
        </div>
      </div>

      <Modal open={siteModalOpen} onClose={() => setSiteModalOpen(false)} title="Cadastrar Site">
        <div className="space-y-4">
          <Input label="Nome" value={siteName} onChange={e => setSiteName(e.target.value)} />
          <TextArea label="Observações" value={siteNotes} onChange={e => setSiteNotes(e.target.value)} rows={3} />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setSiteModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreateSite} loading={createSite.isPending}>Salvar</Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!notesSite}
        onClose={() => setNotesSite(null)}
        title={notesSite ? `Notas do Site - ${notesSite.name}` : 'Notas do Site'}
        maxWidth="max-w-3xl"
      >
        {notesSite && (
          <NotesPanel
            entityType="site"
            entityId={notesSite.id}
            title="Notas do Site"
          />
        )}
      </Modal>

      <Modal
        open={deployModalOpen}
        onClose={resetDeployModal}
        title="Criar Token de Deploy"
      >
        <div className="space-y-4">
          <Select
            label="Site"
            value={deploySiteId}
            onChange={(e) => setDeploySiteId(e.target.value)}
            options={[
              { value: '', label: activeSitesList.length === 0 ? 'Nenhum site ativo' : 'Selecione um site' },
              ...activeSitesList.map((site) => ({ value: site.id, label: site.name })),
            ]}
            disabled={activeSitesList.length === 0}
          />

          <TextArea
             label="Descrição"
            placeholder="Ex: onboarding de novo agente"
            value={deployDescription}
            onChange={(e) => setDeployDescription(e.target.value)}
            rows={3}
          />

          <Input
            label="Expira em (horas)"
            type="number"
            min={1}
            value={deployExpiresInHours ?? ''}
            onChange={(e) => {
              const raw = e.target.value;
              setDeployExpiresInHours(raw === '' ? null : Number(raw));
            }}
          />

          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={deployMultiUse}
              onChange={(e) => setDeployMultiUse(e.target.checked)}
              className="rounded border-border bg-surface-light"
            />
            Permitir multiuso
          </label>

          {generatedDeployToken && (
            <div className="space-y-3 rounded-lg border border-border bg-black/20 p-3">
              <p className="text-xs uppercase tracking-wide text-muted">Token gerado</p>
              <p className="break-all font-mono text-sm text-foreground">{generatedDeployToken.token}</p>
              <div className="flex flex-wrap items-center gap-2">
                <Badge color={generatedDeployToken.multiUse ? 'accent' : 'slate'}>
                  {generatedDeployToken.multiUse ? 'Multiuso' : 'Uso único'}
                </Badge>
                <Badge color="slate">
                  Expira: {generatedDeployToken.expiresAt ? new Date(generatedDeployToken.expiresAt).toLocaleString('pt-BR') : 'Sem expiração'}
                </Badge>
              </div>
              <div className="flex justify-end">
                <Button variant="secondary" onClick={handleCopyDeployToken}>
                  <Copy className="h-4 w-4" /> Copiar Token
                </Button>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={resetDeployModal}>Cancelar</Button>
            <Button
              onClick={handleCreateDeployToken}
              loading={createDeployToken.isPending}
              disabled={activeSitesList.length === 0}
            >
              <KeyRound className="h-4 w-4" /> Gerar Token
            </Button>
          </div>
        </div>
      </Modal>

      <TransferBeforeDeleteModal
        open={transferModalOpen}
        onClose={() => setTransferModalOpen(false)}
        entityType="client"
        entityName={c.name}
        agentIds={(agents.data ?? []).map((a) => a.id)}
        sourceClientId={c.id}
        onSuccess={handleTransferAndDelete}
      />
    </div>
  );
}
