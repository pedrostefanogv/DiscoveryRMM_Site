import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Cpu, HardDrive, Network, MemoryStick,
  Terminal, Key, Send, Wifi, WifiOff, AppWindow, Search,
} from 'lucide-react';
import { useAgent, useAgentHardware, useAgentSoftware, useAgentSoftwareSnapshot, useAgentCommands, useAgentTokens, useSendCommand } from '@/hooks/useAgents';
import { Button, Card, CardHeader, Badge, Loading, ErrorDisplay, Input, Select, DataTable, type Column } from '@/components/ui';
import type { AgentSoftwareInventoryItem } from '@/api';
import { CommandType } from '@/api';
import { isAgentOnlineNow } from '@/utils/agentStatus';
import { useNowTick } from '@/hooks/useNowTick';
import toast from 'react-hot-toast';

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
  const commands = useAgentCommands(id!);
  const tokens = useAgentTokens(id!);
  const now = useNowTick(5_000);

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

      {/* Hardware Overview */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <HardwareCard
          icon={Cpu}
          label="Processador"
          value={hw.data?.hardware?.processor ?? '—'}
          sub={hw.data?.hardware ? `${hw.data.hardware.processorCores ?? '?'}C / ${hw.data.hardware.processorThreads ?? '?'}T` : ''}
        />
        <HardwareCard
          icon={MemoryStick}
          label="Memória RAM"
          value={formatBytes(hw.data?.hardware?.totalMemoryBytes ?? null)}
          sub={`${hw.data?.memoryModules?.length ?? 0} módulo(s)`}
        />
        <HardwareCard
          icon={HardDrive}
          label="Discos"
          value={`${hw.data?.disks?.length ?? 0} disco(s)`}
          sub={hw.data?.disks?.map(d => `${d.driveLetter}: ${formatBytes(d.totalSizeBytes)}`).join(', ') ?? ''}
        />
        <HardwareCard
          icon={Network}
          label="Rede"
          value={`${hw.data?.networkAdapters?.length ?? 0} adaptador(es)`}
          sub={hw.data?.networkAdapters?.find(n => n.ipAddress)?.ipAddress ?? ''}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Commands */}
        <Card>
          <CardHeader title="Comandos" subtitle="Enviar e histórico" />
          <CommandPanel agentId={id!} />
          <div className="mt-4 max-h-60 space-y-2 overflow-y-auto">
            {(commands.data ?? []).map(cmd => (
              <div key={cmd.id} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-xs">
                <span className="text-slate-300">
                  <Terminal className="mr-1.5 inline h-3 w-3" />
                  Tipo {cmd.commandType}
                </span>
                <Badge color={cmd.status === 'Completed' ? 'success' : cmd.status === 'Failed' ? 'danger' : 'slate'}>
                  {cmd.status}
                </Badge>
              </div>
            ))}
          </div>
        </Card>

        {/* Tokens */}
        <Card>
          <CardHeader title="Tokens" subtitle={`${tokens.data?.length ?? 0} token(s)`} />
          <div className="space-y-2">
            {(tokens.data ?? []).map(tok => (
              <div key={tok.id} className="flex items-center gap-3 rounded-lg bg-white/5 px-3 py-2">
                <Key className="h-4 w-4 text-warning shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-white font-mono">
                    {tok.token ? `${tok.token.slice(0, 20)}...` : 'Token indisponível'}
                  </p>
                  <p className="text-xs text-slate-500">{tok.description ?? 'Sem descrição'}</p>
                </div>
              </div>
            ))}
            {(tokens.data?.length ?? 0) === 0 && (
              <p className="text-sm text-slate-500">Nenhum token</p>
            )}
          </div>
        </Card>
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
            <div className="mb-3 flex flex-col gap-3 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <AppWindow className="h-3.5 w-3.5" />
                Endpoint: <code className="font-mono">GET /api/Agents/{id}/software?cursor=&lt;guid&gt;&amp;limit=&lt;n&gt;&amp;search=&lt;texto&gt;&amp;order=asc|desc</code>
              </div>
              <div className="flex items-center gap-2">
                <span>Atualizado:</span>
                <span className="text-slate-300">{formatDate(softwareSnapshot.data?.updatedAt ?? null)}</span>
              </div>
            </div>

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
      {hw.data?.disks && hw.data.disks.length > 0 && (
        <Card>
          <CardHeader title="Discos" />
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/5 text-xs uppercase text-slate-400">
                  <th className="px-4 py-2">Drive</th>
                  <th className="px-4 py-2">Label</th>
                  <th className="px-4 py-2">FS</th>
                  <th className="px-4 py-2">Total</th>
                  <th className="px-4 py-2">Livre</th>
                  <th className="px-4 py-2">Tipo</th>
                </tr>
              </thead>
              <tbody>
                {hw.data.disks.map(d => (
                  <tr key={d.id} className="border-b border-white/5">
                    <td className="px-4 py-2 text-white font-mono">{d.driveLetter}</td>
                    <td className="px-4 py-2 text-slate-300">{d.label ?? '—'}</td>
                    <td className="px-4 py-2 text-slate-400">{d.fileSystem ?? '—'}</td>
                    <td className="px-4 py-2 text-slate-300">{formatBytes(d.totalSizeBytes)}</td>
                    <td className="px-4 py-2 text-slate-300">{formatBytes(d.freeSpaceBytes)}</td>
                    <td className="px-4 py-2 text-slate-400">{d.mediaType ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {hw.data?.networkAdapters && hw.data.networkAdapters.length > 0 && (
        <Card>
          <CardHeader title="Adaptadores de Rede" />
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/5 text-xs uppercase text-slate-400">
                  <th className="px-4 py-2">Nome</th>
                  <th className="px-4 py-2">IP</th>
                  <th className="px-4 py-2">MAC</th>
                  <th className="px-4 py-2">Gateway</th>
                  <th className="px-4 py-2">DHCP</th>
                </tr>
              </thead>
              <tbody>
                {hw.data.networkAdapters.map(n => (
                  <tr key={n.id} className="border-b border-white/5">
                    <td className="px-4 py-2 text-white">{n.name}</td>
                    <td className="px-4 py-2 font-mono text-slate-300">{n.ipAddress ?? '—'}</td>
                    <td className="px-4 py-2 font-mono text-slate-400">{n.macAddress ?? '—'}</td>
                    <td className="px-4 py-2 text-slate-400">{n.gateway ?? '—'}</td>
                    <td className="px-4 py-2">
                      <Badge color={n.isDhcpEnabled ? 'success' : 'slate'}>
                        {n.isDhcpEnabled ? 'Sim' : 'Não'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function HardwareCard({ icon: Icon, label, value, sub }: { icon: typeof Cpu; label: string; value: string; sub: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/5 bg-surface p-4">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-slate-400">{label}</p>
        <p className="truncate text-sm font-medium text-white">{value}</p>
        {sub && <p className="truncate text-xs text-slate-500">{sub}</p>}
      </div>
    </div>
  );
}

function CommandPanel({ agentId }: { agentId: string }) {
  const sendCmd = useSendCommand();
  const [cmdType, setCmdType] = useState('0');
  const [payload, setPayload] = useState('');

  const cmdOptions = [
    { value: '0', label: 'Reiniciar' },
    { value: '1', label: 'Desligar' },
    { value: '2', label: 'Executar Script' },
    { value: '3', label: 'Atualizar Agente' },
    { value: '4', label: 'Coletar Inventário' },
  ];

  const handleSend = () => {
    sendCmd.mutate(
      { id: agentId, data: { commandType: Number(cmdType) as CommandType, payload } },
      {
        onSuccess: () => { toast.success('Comando enviado'); setPayload(''); },
        onError: () => toast.error('Erro ao enviar comando'),
      },
    );
  };

  return (
    <div className="flex gap-3">
      <div className="w-44">
        <Select options={cmdOptions} value={cmdType} onChange={e => setCmdType(e.target.value)} />
      </div>
      <Input
        className="flex-1"
        placeholder="Payload (opcional)"
        value={payload}
        onChange={e => setPayload(e.target.value)}
      />
      <Button onClick={handleSend} loading={sendCmd.isPending} size="sm">
        <Send className="h-4 w-4" />
      </Button>
    </div>
  );
}
