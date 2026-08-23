import { Cpu, MemoryStick, HardDrive, Radio, Clock, Activity, ArrowDown, ArrowUp, Thermometer } from 'lucide-react';
import type { AgentHeartbeatMetrics } from '@/api';
import { MetricBar } from './MetricBar';
import { Card, CardHeader } from './Card';

interface AgentHeartbeatCardProps {
  metrics: AgentHeartbeatMetrics | undefined | null;
  /** If true, shows a subtle "no data" state instead of hiding */
  showEmpty?: boolean;
}

function formatUptime(seconds: number | undefined | null): string {
  if (seconds == null || !Number.isFinite(seconds)) return '\u2014';
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
        <p className="py-4 text-center text-sm text-muted">
          Nenhuma métrica de heartbeat recebida ainda.
        </p>
      </Card>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-gradient-to-br from-emerald-500/5 via-surface-light to-surface-light p-5 dark:from-emerald-500/5 dark:via-slate-900/30 dark:to-slate-900/20">
      <div className="mb-4 flex items-center gap-2">
        <span className="rounded-md bg-emerald-500/15 p-1.5 text-emerald-600 dark:bg-emerald-400/15 dark:text-emerald-300">
          <Activity className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-medium text-foreground">Métricas Ao Vivo</p>
          <p className="text-xs text-muted">
            Última atualização
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

      {/* Disk I/O */} 
      <div className="mt-3">
        <div className="mb-1.5 flex items-center gap-1.5">
          <HardDrive className="h-3.5 w-3.5 text-muted" />
          <span className="text-xs font-medium text-muted">Disco</span>
          {metrics.diskUsedGb != null && metrics.diskTotalGb != null && (
            <span className="text-[10px] text-muted">
              {Math.round(metrics.diskUsedGb)} / {Math.round(metrics.diskTotalGb)} GB
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {/* Leitura */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <ArrowUp className="h-3 w-3 text-cyan-500" />
                <span className="text-[11px] text-muted">Leitura</span>
              </div>
              <span className="text-xs font-semibold tabular-nums text-cyan-600 dark:text-cyan-400">
                {metrics.diskReadPercent != null ? `${Math.round(metrics.diskReadPercent)}%` : '\u2014'}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-cyan-500/20">
              <div
                className="h-full rounded-full bg-cyan-500 transition-all duration-500 ease-out"
                style={{ width: `${Math.min(100, metrics.diskReadPercent ?? 0)}%` }}
              />
            </div>
          </div>
          {/* Escrita */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <ArrowDown className="h-3 w-3 text-amber-500" />
                <span className="text-[11px] text-muted">Escrita</span>
              </div>
              <span className="text-xs font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                {metrics.diskWritePercent != null ? `${Math.round(metrics.diskWritePercent)}%` : '\u2014'}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-amber-500/20">
              <div
                className="h-full rounded-full bg-amber-500 transition-all duration-500 ease-out"
                style={{ width: `${Math.min(100, metrics.diskWritePercent ?? 0)}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Extra metrics row */}
      <div className="mt-4 grid grid-cols-5 gap-3 border-t border-border pt-3 text-xs">
        <div className="text-center">
          <p className="flex items-center justify-center gap-1 text-muted">
            <Radio className="h-3 w-3" />
            P2P
          </p>
          <p className="mt-0.5 font-semibold tabular-nums text-foreground">
            {metrics.p2pPeers ?? '\u2014'}
          </p>
        </div>
        <div className="text-center">
          <p className="flex items-center justify-center gap-1 text-muted">
            <Clock className="h-3 w-3" />
            Uptime
          </p>
          <p className="mt-0.5 font-semibold tabular-nums text-foreground">
            {formatUptime(metrics.uptimeSeconds)}
          </p>
        </div>
        <div className="text-center">
          <p className="flex items-center justify-center gap-1 text-muted">
            <Activity className="h-3 w-3" />
            Processos
          </p>
          <p className="mt-0.5 font-semibold tabular-nums text-foreground">
            {metrics.processCount ?? '\u2014'}
          </p>
        </div>
        <div className="text-center">
          <p className="flex items-center justify-center gap-1 text-muted">
            <HardDrive className="h-3 w-3" />
            Latência
          </p>
          <p className="mt-0.5 font-semibold tabular-nums text-foreground">
            {metrics.diskResponseMs != null ? `${Math.round(metrics.diskResponseMs)}ms` : '\u2014'}
          </p>
        </div>
        <div className="text-center">
          <p className="flex items-center justify-center gap-1 text-muted">
            <Thermometer className="h-3 w-3" />
            Temp
          </p>
          <p className={`mt-0.5 font-semibold tabular-nums ${metrics.cpuTemperatureCelsius != null ? (metrics.cpuTemperatureCelsius > 80 ? 'text-danger' : metrics.cpuTemperatureCelsius > 60 ? 'text-warning' : 'text-success') : 'text-foreground'}`}>
            {metrics.cpuTemperatureCelsius != null ? `${Math.round(metrics.cpuTemperatureCelsius)}°C` : '\u2014'}
          </p>
        </div>
      </div>
    </div>
  );
}
