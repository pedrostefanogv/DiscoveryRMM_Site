import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Monitor, Trash2, AppWindow, Building2, Ticket as TicketIcon } from 'lucide-react';
import { useClient, useDeleteClient } from '@/hooks/useClients';
import { useSites, useCreateSite } from '@/hooks/useSites';
import { useAgentsByClient } from '@/hooks/useAgents';
import { useTicketsByClient } from '@/hooks/useTickets';
import { useLogs } from '@/hooks/useLogs';
import { Button, Card, CardHeader, Badge, Loading, ErrorDisplay, Modal, Input, TextArea, StatCard } from '@/components/ui';
import { NotesPanel } from '@/components/notes/NotesPanel';
import { isAgentOnlineNow } from '@/utils/agentStatus';
import { useNowTick } from '@/hooks/useNowTick';
import { useSoftwareInventorySnapshot } from '@/hooks/useSoftwareInventory';
import { LogLevel, type TicketPriority, type Site } from '@/api';
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

  const client = useClient(id!);
  const sites = useSites(id!);
  const agents = useAgentsByClient(id!);
  const tickets = useTicketsByClient(id!);
  const logs = useLogs({ clientId: id, limit: 8 });
  const softwareSnapshot = useSoftwareInventorySnapshot('client', id);
  const now = useNowTick(5_000);
  const deleteClient = useDeleteClient();
  const createSite = useCreateSite();

  if (client.isLoading) return <Loading />;
  if (client.isError || !client.data) return <ErrorDisplay onRetry={() => client.refetch()} />;

  const c = client.data;

  const handleDelete = () => {
    if (!confirm('Tem certeza que deseja excluir este cliente?')) return;
    deleteClient.mutate(c.id, {
      onSuccess: () => { toast.success('Cliente excluído'); navigate('/clients'); },
      onError: () => toast.error('Erro ao excluir'),
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
  const activeSites = (sites.data ?? []).filter((s) => s.isActive).length;
  const totalAgents = agents.data?.length ?? 0;
  const onlineAgents = (agents.data ?? []).filter((a) => isAgentOnlineNow(a, now)).length;
  const totalInstalledSoftware = softwareSnapshot.data?.totalInstalled ?? 0;
  const totalTickets = tickets.data?.length ?? 0;
  const recentTickets = (tickets.data ?? []).slice(0, 6);
  const recentLogs = (logs.data ?? []).slice(0, 8);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/clients')} aria-label="Voltar" className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">{c.name}</h1>
          <p className="text-sm text-slate-400">Detalhes do Cliente</p>
        </div>
        <Badge color={c.isActive ? 'success' : 'slate'}>{c.isActive ? 'Ativo' : 'Inativo'}</Badge>
        <Button variant="danger" size="sm" onClick={handleDelete}>
          <Trash2 className="h-4 w-4" /> Excluir
        </Button>
      </div>

      {/* Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Monitor}
          label="Agentes"
          value={agents.isLoading ? '—' : totalAgents}
          tone="primary"
          trend={
            !agents.isLoading && totalAgents > 0 ? (
              <span className={`text-xs font-medium ${onlineAgents > 0 ? 'text-success' : 'text-slate-500'}`}>
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
              <span className="text-xs font-medium text-slate-400">{activeSites} ativos</span>
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
              <dt className="text-slate-400">Observações</dt>
              <dd className="mt-0.5 text-white">{c.notes ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Criado em</dt>
              <dd className="mt-0.5 text-white">{new Date(c.createdAt).toLocaleDateString('pt-BR')}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Atualizado em</dt>
              <dd className="mt-0.5 text-white">{new Date(c.updatedAt).toLocaleDateString('pt-BR')}</dd>
            </div>
            <div className="border-t border-white/5 pt-3">
              <dt className="text-slate-400">Softwares distintos</dt>
              <dd className="mt-0.5 text-white">
                {softwareSnapshot.isLoading ? '—' : (softwareSnapshot.data?.distinctSoftware ?? 0)}
              </dd>
            </div>
            <div>
              <dt className="text-slate-400">Agentes com inventário</dt>
              <dd className="mt-0.5 text-white">
                {softwareSnapshot.isLoading ? '—' : (softwareSnapshot.data?.distinctAgents ?? 0)}
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
              <div key={site.id} className="flex items-center gap-3 rounded-lg bg-white/5 px-3 py-2">
                <Building2 className="h-4 w-4 text-accent shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">{site.name}</p>
                  {site.notes && <p className="truncate text-xs text-slate-500">{site.notes}</p>}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setNotesSite(site)}
                >
                  Notas
                </Button>
                <Badge color={site.isActive ? 'success' : 'slate'}>{site.isActive ? 'Ativo' : 'Inativo'}</Badge>
              </div>
            ))}
            {sites.isLoading && <p className="text-sm text-slate-500">Carregando...</p>}
            {totalSites === 0 && !sites.isLoading && (
              <p className="text-sm text-slate-500">Nenhum site cadastrado</p>
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
                  className="flex cursor-pointer items-center gap-3 rounded-lg bg-white/5 px-3 py-2 hover:bg-white/10 transition-colors"
                >
                  <TicketIcon className="h-4 w-4 text-warning shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">{ticket.title}</p>
                    <p className="text-xs text-slate-500">{ticket.category ?? 'Sem categoria'}</p>
                  </div>
                  <Badge color={p.color}>{p.label}</Badge>
                </div>
              );
            })}
            {tickets.isLoading && <p className="text-sm text-slate-500">Carregando...</p>}
            {totalTickets === 0 && !tickets.isLoading && (
              <p className="text-sm text-slate-500">Nenhum chamado</p>
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
            />
            <div className="space-y-2">
              {(agents.data ?? []).map(agent => {
                const online = isAgentOnlineNow(agent, now);
                return (
                  <div
                    key={agent.id}
                    onClick={() => navigate(`/agents/${agent.id}`)}
                    className="flex cursor-pointer items-center gap-3 rounded-lg bg-white/5 px-3 py-2 hover:bg-white/10 transition-colors"
                  >
                    <Monitor className="h-4 w-4 text-primary shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-white">
                        {agent.displayName ?? agent.hostname}
                      </p>
                      <p className="text-xs text-slate-500">{agent.operatingSystem ?? 'N/A'}</p>
                    </div>
                    <span className={`h-2 w-2 shrink-0 rounded-full ${online ? 'bg-success' : 'bg-slate-600'}`} />
                  </div>
                );
              })}
              {agents.isLoading && <p className="text-sm text-slate-500">Carregando...</p>}
              {totalAgents === 0 && !agents.isLoading && (
                <p className="text-sm text-slate-500">Nenhum agente</p>
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
                  <div key={log.id} className="flex items-start gap-2 rounded-lg bg-white/5 px-3 py-2">
                    <Badge color={l.color} className="mt-0.5 shrink-0">{l.label}</Badge>
                    <p className="min-w-0 flex-1 truncate text-sm text-slate-300">{log.message}</p>
                  </div>
                );
              })}
              {logs.isLoading && <p className="text-sm text-slate-500">Carregando...</p>}
              {(logs.data?.length ?? 0) === 0 && !logs.isLoading && (
                <p className="text-sm text-slate-500">Nenhum log registrado</p>
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
    </div>
  );
}
