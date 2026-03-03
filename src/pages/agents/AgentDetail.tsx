import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Cpu, HardDrive, Network, MemoryStick,
  Terminal, Key, Send, Wifi, WifiOff,
} from 'lucide-react';
import { useAgent, useAgentHardware, useAgentCommands, useAgentTokens, useSendCommand } from '@/hooks/useAgents';
import { Button, Card, CardHeader, Badge, Loading, ErrorDisplay, Input, Select } from '@/components/ui';
import { CommandType } from '@/api';
import toast from 'react-hot-toast';

function formatBytes(bytes: number | null): string {
  if (!bytes) return '—';
  const gb = bytes / (1024 ** 3);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / (1024 ** 2);
  return `${mb.toFixed(0)} MB`;
}

export default function AgentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const agent = useAgent(id!);
  const hw = useAgentHardware(id!);
  const commands = useAgentCommands(id!);
  const tokens = useAgentTokens(id!);

  if (agent.isLoading) return <Loading />;
  if (agent.isError || !agent.data) return <ErrorDisplay onRetry={() => agent.refetch()} />;

  const a = agent.data;

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
        <Badge color={a.isOnline ? 'success' : 'slate'}>
          <span className="flex items-center gap-1">
            {a.isOnline ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {a.isOnline ? 'Online' : 'Offline'}
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
                  <p className="truncate text-sm text-white font-mono">{tok.token.slice(0, 20)}...</p>
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
