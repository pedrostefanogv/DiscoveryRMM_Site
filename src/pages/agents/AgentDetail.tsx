import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Cpu, MemoryStick, Ticket as TicketIcon, Tags,
  Wifi, WifiOff, AppWindow, Search, Clock, HardDrive,
} from 'lucide-react';
import { useAgent, useAgentHardware, useAgentSoftware, useAgentSoftwareSnapshot } from '@/hooks/useAgents';
import { useTickets } from '@/hooks/useTickets';
import { useLogs } from '@/hooks/useLogs';
import { Button, Card, CardHeader, Badge, Loading, ErrorDisplay, Input, Select, DataTable, StatCard, type Column } from '@/components/ui';
import { NotesPanel } from '@/components/notes/NotesPanel';
import type { AgentSoftwareInventoryItem } from '@/api';
import { LogLevel } from '@/api';
import { isAgentOnlineNow } from '@/utils/agentStatus';
import { useNowTick } from '@/hooks/useNowTick';
import { agentLabelsApi } from '@/modules/agent-labels/api';
import { AgentLabelSourceType, type AgentLabel } from '@/modules/agent-labels/types';

const levelLabels: Record<number, { label: string; color: 'slate' | 'primary' | 'warning' | 'danger' | 'accent' }> = {
  [LogLevel.Debug]: { label: 'Debug', color: 'slate' },
  [LogLevel.Info]: { label: 'Info', color: 'primary' },
  [LogLevel.Warning]: { label: 'Aviso', color: 'warning' },
  [LogLevel.Error]: { label: 'Erro', color: 'danger' },
  [LogLevel.Critical]: { label: 'Crítico', color: 'danger' },
};

function formatBytes(bytes: number | null): string {
  if (!bytes) return '—';
  const gb = bytes / (1024 ** 3);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / (1024 ** 2);
  return `${mb.toFixed(0)} MB`;
}

function formatDate(date: string | null): string {
  if (!date) return '—';
  return new Date(date).toLocaleString('pt-BR');
}

export default function AgentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [softwareLimitSelected, setSoftwareLimitSelected] = useState('10');
  const [softwareOrder, setSoftwareOrder] = useState<'asc' | 'desc'>('desc');
  const [softwareSearchInput, setSoftwareSearchInput] = useState('');
  const [softwareSearchApplied, setSoftwareSearchApplied] = useState('');
  const [softwarePage, setSoftwarePage] = useState(1);
  const [softwarePageCursors, setSoftwarePageCursors] = useState<Array<string | undefined>>([undefined]);
  const [automaticLabels, setAutomaticLabels] = useState<AgentLabel[]>([]);
  const [isLoadingLabels, setIsLoadingLabels] = useState(true);
  const [labelsError, setLabelsError] = useState<string | null>(null);

  const agent = useAgent(id!);
  const hw = useAgentHardware(id!);
  const softwareCursor = softwarePageCursors[softwarePage - 1];
  const software = useAgentSoftware(id!, {
    cursor: softwareCursor,
    limit: Number(softwareLimitSelected),
    search: softwareSearchApplied,
    order: softwareOrder,
  });
  const softwareSnapshot = useAgentSoftwareSnapshot(id!);
  const agentLogs = useLogs({ agentId: id, limit: 10 });
  const agentTickets = useTickets({ agentId: id, limit: 5 });
  const now = useNowTick(5_000);

  useEffect(() => {
    let isCancelled = false;

    async function loadAgentLabels() {
      if (!id) {
        setAutomaticLabels([]);
        setIsLoadingLabels(false);
        return;
      }

      setIsLoadingLabels(true);
      setLabelsError(null);

      try {
        const data = await agentLabelsApi.getAgentLabels(id);
        if (isCancelled) return;

        const automaticOnly = data
          .filter(item => item.sourceType === AgentLabelSourceType.Automatic)
          .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
        setAutomaticLabels(automaticOnly);
      } catch {
        if (isCancelled) return;
        setLabelsError('Falha ao carregar labels automáticas.');
      } finally {
        if (!isCancelled) {
          setIsLoadingLabels(false);
        }
      }
    }

    void loadAgentLabels();

    return () => {
      isCancelled = true;
    };
  }, [id]);

  if (agent.isLoading) return <Loading />;
  if (agent.isError || !agent.data) return <ErrorDisplay onRetry={() => agent.refetch()} />;

  const a = agent.data;
  const isOnlineNow = isAgentOnlineNow(a, now);
  const softwareItems = software.data?.items ?? [];
  const softwareLimitReturned = software.data?.limit ?? Number(softwareLimitSelected);
  const softwareTotalCount = software.data?.count ?? softwareSnapshot.data?.totalInstalled ?? 0;
  const softwareTotalPages = Math.max(1, Math.ceil(softwareTotalCount / softwareLimitReturned));
  const canGoPrevSoftwarePage = softwarePage > 1 && !software.isFetching;
  const canGoNextSoftwarePage = Boolean(software.data?.hasMore && software.data?.nextCursor) && !software.isFetching;
  const disks = hw.data?.disks ?? [];
  const totalDiskBytes = disks.reduce((acc, disk) => acc + (disk.totalSizeBytes ?? 0), 0);
  const freeDiskBytes = disks.reduce((acc, disk) => acc + (disk.freeSpaceBytes ?? 0), 0);
  const usedDiskBytes = Math.max(0, totalDiskBytes - freeDiskBytes);
  const diskUsagePercent = totalDiskBytes > 0 ? Math.min(100, Math.round((usedDiskBytes / totalDiskBytes) * 100)) : null;

  const resetSoftwarePagination = () => {
    setSoftwarePage(1);
    setSoftwarePageCursors([undefined]);
  };

  const handleApplySoftwareFilters = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSoftwareSearchApplied(softwareSearchInput.trim());
    resetSoftwarePagination();
  };

  const handleClearSoftwareSearch = () => {
    setSoftwareSearchInput('');
    setSoftwareSearchApplied('');
    resetSoftwarePagination();
  };

  const handleSoftwareLimitChange = (value: string) => {
    setSoftwareLimitSelected(value);
    resetSoftwarePagination();
  };

  const handleSoftwareOrderChange = (value: 'asc' | 'desc') => {
    setSoftwareOrder(value);
    resetSoftwarePagination();
  };

  const goToNextSoftwarePage = () => {
    if (!software.data?.nextCursor) return;
    setSoftwarePageCursors((prev) => {
      const next = [...prev];
      next[softwarePage] = software.data.nextCursor ?? undefined;
      return next;
    });
    setSoftwarePage((p) => p + 1);
  };

  const goToPreviousSoftwarePage = () => {
    setSoftwarePage((p) => Math.max(1, p - 1));
  };

  const softwareLimitOptions = [
    { value: '10', label: '10 por página' },
    { value: '30', label: '30 por página' },
    { value: '50', label: '50 por página' },
  ];
  const softwareOrderOptions = [
    { value: 'desc', label: 'Mais recente primeiro' },
    { value: 'asc', label: 'Mais antigo primeiro' },
  ];
  const softwareColumns: Column<AgentSoftwareInventoryItem>[] = [
    {
      key: 'name',
      header: 'Aplicativo',
      render: item => (
        <div>
          <p className="font-medium text-white">{item.name}</p>
          <p className="text-xs text-slate-500">{item.publisher ?? 'Sem fabricante'}</p>
        </div>
      ),
    },
    {
      key: 'version',
      header: 'Versão',
      className: 'font-mono',
      render: item => item.version ?? '—',
    },
    {
      key: 'source',
      header: 'Fonte',
      render: item => item.source ?? '—',
    },
    {
      key: 'lastSeenAt',
      header: 'Última coleta',
      render: item => formatDate(item.lastSeenAt ?? item.collectedAt),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate(-1)} aria-label="Voltar" className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">{a.displayName ?? a.hostname}</h1>
          <p className="text-sm text-slate-400">{a.hostname} — {a.operatingSystem} {a.osVersion}</p>
        </div>
        <Badge color={isOnlineNow ? 'success' : 'slate'}>
          <span className="flex items-center gap-1">
            {isOnlineNow ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {isOnlineNow ? 'Online' : 'Offline'}
          </span>
        </Badge>
      </div>

      {/* Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Cpu}
          label="Processador"
          value={hw.data?.hardware?.processor ? `${hw.data.hardware.processorCores ?? '?'}C / ${hw.data.hardware.processorThreads ?? '?'}T` : '—'}
          tone="primary"
          trend={hw.data?.hardware?.processor
            ? <span className="max-w-[120px] truncate text-xs text-slate-400" title={hw.data.hardware.processor}>{hw.data.hardware.processor.split(' ').slice(0, 3).join(' ')}</span>
            : undefined}
        />
        <StatCard
          icon={MemoryStick}
          label="Memória RAM"
          value={formatBytes(hw.data?.hardware?.totalMemoryBytes ?? null)}
          tone="accent"
          trend={hw.data?.memoryModules?.length
            ? <span className="text-xs text-slate-400">{hw.data.memoryModules.length} módulo(s)</span>
            : undefined}
        />
        <Card className="border border-cyan-500/20 bg-gradient-to-br from-cyan-500/10 via-slate-900/30 to-slate-900/20 p-4">
          <div className="mb-3 flex items-center gap-2">
            <span className="rounded-md bg-cyan-400/15 p-1.5 text-cyan-300">
              <Tags className="h-4 w-4" />
            </span>
            <div>
              <p className="text-xs uppercase tracking-[0.12em] text-cyan-200/80">Labels automáticas</p>
              <p className="text-xs text-slate-400">Aplicadas por regras</p>
            </div>
          </div>

          {isLoadingLabels ? (
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 4 }).map((_, idx) => (
                <span key={idx} className="h-6 w-20 animate-pulse rounded-full bg-white/10" />
              ))}
            </div>
          ) : labelsError ? (
            <p className="text-sm text-danger">Falha ao carregar labels.</p>
          ) : automaticLabels.length === 0 ? (
            <p className="text-sm text-slate-400">Nenhuma label automática aplicada.</p>
          ) : (
            <div className="max-h-[86px] overflow-y-auto pr-1">
              <div className="flex flex-wrap gap-2">
                {automaticLabels.map(item => (
                  <Badge key={item.id} color="accent">{item.label}</Badge>
                ))}
              </div>
            </div>
          )}
        </Card>
        <StatCard
          icon={AppWindow}
          label="Softwares instalados"
          value={softwareSnapshot.isLoading ? '—' : (softwareSnapshot.data?.totalInstalled ?? 0)}
          tone="success"
          trend={softwareSnapshot.data?.lastCollectedAt
            ? <span className="text-xs text-slate-400">Coletado {new Date(softwareSnapshot.data.lastCollectedAt).toLocaleDateString('pt-BR')}</span>
            : undefined}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <NotesPanel
          entityType="agent"
          entityId={a.id}
          title="Notas do Agente"
        />

        {/* Disk */}
        <Card>
          <CardHeader title="Disco" subtitle="Espaço agregado do agente" />

          {disks.length === 0 ? (
            <p className="text-sm text-slate-500">Sem dados de disco coletados para este agente.</p>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg bg-white/5 px-3 py-2">
                  <p className="text-xs text-slate-500">Usado</p>
                  <p className="text-sm font-medium text-white">{formatBytes(usedDiskBytes)}</p>
                </div>
                <div className="rounded-lg bg-white/5 px-3 py-2">
                  <p className="text-xs text-slate-500">Livre</p>
                  <p className="text-sm font-medium text-white">{formatBytes(freeDiskBytes)}</p>
                </div>
                <div className="rounded-lg bg-white/5 px-3 py-2">
                  <p className="text-xs text-slate-500">Total</p>
                  <p className="text-sm font-medium text-white">{formatBytes(totalDiskBytes)}</p>
                </div>
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1 text-slate-400">
                    <HardDrive className="h-3.5 w-3.5" />
                    Utilização
                  </span>
                  <span className="font-medium text-slate-300">{diskUsagePercent ?? 0}%</span>
                </div>
                <progress
                  className="h-2 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-white/10 [&::-webkit-progress-value]:bg-cyan-400 [&::-moz-progress-bar]:bg-cyan-400"
                  value={diskUsagePercent ?? 0}
                  max={100}
                />
              </div>

              <div className="max-h-40 space-y-2 overflow-y-auto">
                {disks.map((disk) => {
                  const diskUsedBytes = Math.max(0, disk.totalSizeBytes - disk.freeSpaceBytes);
                  const diskUsedPercent = disk.totalSizeBytes > 0
                    ? Math.min(100, Math.round((diskUsedBytes / disk.totalSizeBytes) * 100))
                    : 0;

                  return (
                    <div key={disk.id} className="rounded-lg bg-white/5 px-3 py-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-slate-200">
                          {disk.driveLetter}{disk.label ? ` (${disk.label})` : ''}
                        </span>
                        <span className="text-slate-400">{diskUsedPercent}% usado</span>
                      </div>
                      <progress
                        className="mt-2 h-1.5 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-white/10 [&::-webkit-progress-value]:bg-cyan-400 [&::-moz-progress-bar]:bg-cyan-400"
                        value={diskUsedPercent}
                        max={100}
                      />
                      <p className="mt-1 text-slate-500">
                        {formatBytes(diskUsedBytes)} usados de {formatBytes(disk.totalSizeBytes)}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Agent Info + Hardware Detail */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Info do Agente */}
        <Card>
          <CardHeader title="Informações" />
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-slate-400">Hostname</dt>
              <dd className="mt-0.5 font-mono text-white">{a.hostname}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Sistema Operacional</dt>
              <dd className="mt-0.5 text-white">{a.operatingSystem ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Versão do SO</dt>
              <dd className="mt-0.5 font-mono text-white">{a.osVersion ?? '—'}</dd>
            </div>
            {hw.data?.hardware?.osBuild && (
              <div>
                <dt className="text-slate-400">Build</dt>
                <dd className="mt-0.5 font-mono text-white">{hw.data.hardware.osBuild}</dd>
              </div>
            )}
            <div className="border-t border-white/5 pt-3">
              <dt className="text-slate-400">Versão do Agente</dt>
              <dd className="mt-0.5 font-mono text-white">{a.agentVersion ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Último IP</dt>
              <dd className="mt-0.5 font-mono text-white">{a.lastIpAddress ?? hw.data?.networkAdapters?.find(n => n.ipAddress && !n.ipAddress.startsWith('169.254'))?.ipAddress ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Última vez online</dt>
              <dd className="mt-0.5 text-white">{a.lastSeen ? formatDate(a.lastSeen) : (a.lastSeenAt ? formatDate(a.lastSeenAt) : '—')}</dd>
            </div>
            {hw.data?.hardware?.manufacturer && (
              <div className="border-t border-white/5 pt-3">
                <dt className="text-slate-400">Fabricante / Modelo</dt>
                <dd className="mt-0.5 text-white">{hw.data.hardware.manufacturer} {hw.data.hardware.model ?? ''}</dd>
              </div>
            )}
            {hw.data?.hardware?.serialNumber && (
              <div>
                <dt className="text-slate-400">Número de série</dt>
                <dd className="mt-0.5 font-mono text-white">{hw.data.hardware.serialNumber}</dd>
              </div>
            )}
          </dl>
        </Card>

        {/* Processador + Memória */}
        <Card>
            <CardHeader title="Últimos Chamados" />
            <div className="space-y-2">
              {agentTickets.isLoading && (
                <div className="py-4 text-center text-sm text-slate-400">
                  Carregando chamados...
                </div>
              )}
              {!agentTickets.isLoading && (!agentTickets.data || agentTickets.data.length === 0) && (
                <div className="py-4 text-center text-sm text-slate-400">
                  Nenhum chamado encontrado
                </div>
              )}
              {!agentTickets.isLoading && agentTickets.data && agentTickets.data.length > 0 && (
                <div className="space-y-2">
                  {agentTickets.data.map(ticket => {
                    const priorityColors: Record<string, 'slate' | 'success' | 'warning' | 'danger'> = {
                      Low: 'slate',
                      Medium: 'success',
                      High: 'warning',
                      Critical: 'danger',
                    };
                    const priorityLabels: Record<string, string> = {
                      Low: 'Baixa',
                      Medium: 'Média',
                      High: 'Alta',
                      Critical: 'Crítica',
                    };
                    return (
                      <button
                        key={ticket.id}
                        onClick={() => navigate(`/tickets/${ticket.id}`)}
                        className="w-full rounded-lg bg-white/5 px-3 py-2.5 text-left transition-colors hover:bg-white/10"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <TicketIcon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                              <p className="truncate text-sm font-medium text-white">
                                {ticket.title}
                              </p>
                            </div>
                            <p className="mt-1 text-xs text-slate-400">
                              {new Date(ticket.createdAt).toLocaleDateString('pt-BR')}
                              {ticket.closedAt && ' • Encerrado'}
                            </p>
                          </div>
                          <Badge color={priorityColors[ticket.priority] ?? 'slate'} className="shrink-0">
                            {priorityLabels[ticket.priority] ?? ticket.priority}
                          </Badge>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
          </div>
        </Card>

        {/* Adaptadores de Rede */}
        {hw.data?.networkAdapters && hw.data.networkAdapters.length > 0 && (
          <Card>
            <CardHeader title="Adaptadores de Rede" subtitle={`${hw.data.networkAdapters.length} adaptador(es)`} />
            <div className="space-y-2">
              {hw.data.networkAdapters.map(n => (
                <div key={n.id} className="rounded-lg bg-white/5 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-white">{n.name}</p>
                      {n.macAddress && <p className="font-mono text-xs text-slate-500">{n.macAddress}</p>}
                    </div>
                    <Badge color={n.isDhcpEnabled ? 'success' : 'slate'}>{n.isDhcpEnabled ? 'DHCP' : 'Estático'}</Badge>
                  </div>
                  {(n.ipAddress || n.gateway) && (
                    <div className="mt-1.5 grid grid-cols-2 gap-2 text-xs">
                      {n.ipAddress && (
                        <div>
                          <span className="text-slate-500">IP: </span>
                          <span className="font-mono text-slate-300">{n.ipAddress}</span>
                          {n.subnetMask && <span className="text-slate-500"> / {n.subnetMask}</span>}
                        </div>
                      )}
                      {n.gateway && (
                        <div>
                          <span className="text-slate-500">Gateway: </span>
                          <span className="font-mono text-slate-300">{n.gateway}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      {/* Software Inventory */}
      <Card>
        <CardHeader
          title="Inventário de Aplicativos"
          subtitle={`${softwareTotalCount} aplicativo(s) no inventário`}
        />
        {software.isLoading ? (
          <Loading message="Carregando inventário de aplicativos..." />
        ) : software.isError ? (
          <ErrorDisplay onRetry={() => software.refetch()} />
        ) : (
          <>
            {softwareSnapshot.data?.updatedAt && (
              <div className="mb-3 flex items-center justify-end gap-2 text-xs text-slate-500">
                <Clock className="h-3.5 w-3.5" />
                <span>Última coleta: <span className="text-slate-300">{formatDate(softwareSnapshot.data.updatedAt)}</span></span>
              </div>
            )}

            <div className="mb-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-lg bg-white/5 px-3 py-2">
                <p className="text-xs text-slate-500">Total instalado</p>
                <p className="text-sm font-medium text-white">{softwareSnapshot.data?.totalInstalled ?? softwareTotalCount}</p>
              </div>
              <div className="rounded-lg bg-white/5 px-3 py-2">
                <p className="text-xs text-slate-500">Primeira detecção</p>
                <p className="text-sm text-slate-300">{formatDate(softwareSnapshot.data?.firstSeenAt ?? null)}</p>
              </div>
              <div className="rounded-lg bg-white/5 px-3 py-2">
                <p className="text-xs text-slate-500">Última coleta</p>
                <p className="text-sm text-slate-300">{formatDate(softwareSnapshot.data?.lastCollectedAt ?? null)}</p>
              </div>
            </div>

            <form className="mb-4 grid gap-3 lg:grid-cols-[1fr_200px_160px_auto_auto]" onSubmit={handleApplySoftwareFilters}>
              <Input
                value={softwareSearchInput}
                onChange={(e) => setSoftwareSearchInput(e.target.value)}
                placeholder="Pesquisar por nome, versão, fabricante, installId, serial ou fonte"
              />
              <Select
                value={softwareOrder}
                options={softwareOrderOptions}
                onChange={(e) => handleSoftwareOrderChange(e.target.value as 'asc' | 'desc')}
              />
              <Select
                value={softwareLimitSelected}
                options={softwareLimitOptions}
                onChange={(e) => handleSoftwareLimitChange(e.target.value)}
              />
              <Button type="submit" variant="secondary" size="sm">
                <Search className="h-4 w-4" />
                Buscar
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={handleClearSoftwareSearch}>
                Limpar
              </Button>
            </form>

            <DataTable
              columns={softwareColumns}
              data={softwareItems}
              keyExtractor={item => item.inventoryId}
              emptyMessage="Nenhum aplicativo encontrado para este agente"
            />
            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-xs text-slate-500">
                Página {softwarePage} de {softwareTotalPages} | {softwareItems.length} item(ns) nesta página
                {softwareSearchApplied ? ` | filtro: "${softwareSearchApplied}"` : ''}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={goToPreviousSoftwarePage} disabled={!canGoPrevSoftwarePage}>
                  Voltar
                </Button>
                <div className="rounded-md border border-white/10 px-3 py-1 text-xs text-slate-300">
                  {softwarePage}
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={goToNextSoftwarePage}
                  disabled={!canGoNextSoftwarePage}
                  loading={software.isFetching}
                >
                  Avançar
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>

      {/* Detailed Hardware Tables */}


      <Card>
        <CardHeader title="Logs Recentes" />
        <div className="max-h-72 space-y-2 overflow-y-auto">
          {(agentLogs.data ?? []).map(log => {
            const l = levelLabels[log.level] ?? { label: '?', color: 'slate' as const };
            return (
              <div key={log.id} className="flex items-start gap-2 rounded-lg bg-white/5 px-3 py-2">
                <Badge color={l.color} className="mt-0.5 shrink-0">{l.label}</Badge>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-300">{log.message}</p>
                  <p className="text-xs text-slate-500">{formatDate(log.createdAt)}</p>
                </div>
              </div>
            );
          })}
          {agentLogs.isLoading && <p className="text-sm text-slate-500">Carregando...</p>}
          {(agentLogs.data?.length ?? 0) === 0 && !agentLogs.isLoading && (
            <p className="text-sm text-slate-500">Nenhum log registrado</p>
          )}
        </div>
      </Card>
    </div>
  );
}
