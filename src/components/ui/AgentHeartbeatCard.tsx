import { Cpu, MemoryStick, HardDrive, Radio, Clock, Activity } from 'lucide-react';
import type { AgentHeartbeatMetrics } from '@/api';
import { MetricBar } from './MetricBar';
import { Card, CardHeader } from './Card';

interface AgentHeartbeatCardProps {
  metrics: AgentHeartbeatMetrics | undefined | null;
  /** If true, shows a subtle "no data" state instead of hiding */
  showEmpty?: boolean;
}

function formatUptime(seconds: number | undefined | null): string {
  if (seconds == null || !Number.isFinite(seconds)) return '—';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  const hours = Math.floor(seconds / 3600);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  return `${hours}h ${Math.round((seconds % 3600) / 60)}m`;
}

export function AgentHeartbeatCard({ metrics, showEmpty = false }: AgentHeartbeatCardProps) {
  if (!metrics && !showEmpty) return null;

  if (!metrics) {
    return (
      <Card>
        <CardHeader title="Métricas Ao Vivo" subtitle="Heartbeat do agente" />
        <p className="py-4 text-center text-sm text-slate-500">
          Nenhuma métrica de heartbeat recebida ainda.
        </p>
      </Card>
    );
  }

  return (
    <div className="rounded-xl border border-white/5 bg-gradient-to-br from-emerald-500/5 via-slate-900/30 to-slate-900/20 p-5">
      <div className="mb-4 flex items-center gap-2">
        <span className="rounded-md bg-emerald-400/15 p-1.5 text-emerald-300">
          <Activity className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-medium text-white">Métricas Ao Vivo</p>
          <p className="text-xs text-slate-400">
            Heartbeat do agente
            {metrics.timestampUtc && (
              <span className="ml-1">
                · {new Date(metrics.timestampUtc).toLocaleTimeString('pt-BR')}
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {/* CPU */}
        <MetricBar
          icon={<Cpu className="h-3.5 w-3.5" />}
          label="CPU"
          value={metrics.cpuPercent}
          suffix="%"
        />

        {/* Memory */}
        <MetricBar
          icon={<MemoryStick className="h-3.5 w-3.5" />}
          label="RAM"
          value={metrics.memoryPercent}
          suffix="%"
          subtitle={
            metrics.memoryUsedGb != null && metrics.memoryTotalGb != null
              ? `${Math.round(metrics.memoryUsedGb)} / ${Math.round(metrics.memoryTotalGb)} GB`
              : undefined
          }
        />
      </div>

      {/* Disk */}
      <div className="mt-3">
        <MetricBar
          icon={<HardDrive className="h-3.5 w-3.5" />}
          label="Disco"
          value={metrics.diskPercent}
          suffix="%"
          subtitle={
            metrics.diskUsedGb != null && metrics.diskTotalGb != null
              ? `${Math.round(metrics.diskUsedGb)} / ${Math.round(metrics.diskTotalGb)} GB`
              : undefined
          }
        />
      </div>

      {/* Extra metrics row */}
      <div className="mt-4 grid grid-cols-3 gap-3 border-t border-white/5 pt-3 text-xs">
        <div className="text-center">
          <p className="flex items-center justify-center gap-1 text-slate-500">
            <Radio className="h-3 w-3" />
            P2P
          </p>
          <p className="mt-0.5 font-semibold tabular-nums text-white">
            {metrics.p2pPeers ?? '—'}
          </p>
        </div>
        <div className="text-center">
          <p className="flex items-center justify-center gap-1 text-slate-500">
            <Clock className="h-3 w-3" />
            Uptime
          </p>
          <p className="mt-0.5 font-semibold tabular-nums text-white">
            {formatUptime(metrics.uptimeSeconds)}
          </p>
        </div>
        <div className="text-center">
          <p className="flex items-center justify-center gap-1 text-slate-500">
            <Activity className="h-3 w-3" />
            Processos
          </p>
          <p className="mt-0.5 font-semibold tabular-nums text-white">
            {metrics.processCount ?? '—'}
          </p>
        </div>
      </div>
    </div>
  );
}
