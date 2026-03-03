import { useState } from 'react';
import { AlertTriangle, Info, AlertCircle, Bug, Shield } from 'lucide-react';
import { useLogs } from '@/hooks/useLogs';
import { Card, Badge, Loading, ErrorDisplay, Select, Input } from '@/components/ui';
import { LogLevel, LogSource, LogType } from '@/api';
import type { LogsQuery, LogEntry } from '@/api';

const levelLabels: Record<number, { label: string; color: 'slate' | 'primary' | 'warning' | 'danger' | 'accent' }> = {
  [LogLevel.Debug]: { label: 'Debug', color: 'slate' },
  [LogLevel.Info]: { label: 'Info', color: 'primary' },
  [LogLevel.Warning]: { label: 'Warning', color: 'warning' },
  [LogLevel.Error]: { label: 'Error', color: 'danger' },
  [LogLevel.Critical]: { label: 'Critical', color: 'danger' },
};

const sourceLabels: Record<number, string> = {
  [LogSource.Agent]: 'Agente',
  [LogSource.Server]: 'Servidor',
  [LogSource.Portal]: 'Portal',
};

const typeLabels: Record<number, string> = {
  [LogType.System]: 'Sistema',
  [LogType.Security]: 'Segurança',
  [LogType.Application]: 'Aplicação',
  [LogType.Hardware]: 'Hardware',
};

export default function LogViewer() {
  const [filters, setFilters] = useState<LogsQuery>({ limit: 100, offset: 0 });
  const logs = useLogs(filters);

  const levelOptions = [
    { value: '', label: 'Todos os níveis' },
    { value: '0', label: 'Debug' },
    { value: '1', label: 'Info' },
    { value: '2', label: 'Warning' },
    { value: '3', label: 'Error' },
    { value: '4', label: 'Critical' },
  ];

  const sourceOptions = [
    { value: '', label: 'Todas as fontes' },
    { value: '0', label: 'Agente' },
    { value: '1', label: 'Servidor' },
    { value: '2', label: 'Portal' },
  ];

  const typeOptions = [
    { value: '', label: 'Todos os tipos' },
    { value: '0', label: 'Sistema' },
    { value: '1', label: 'Segurança' },
    { value: '2', label: 'Aplicação' },
    { value: '3', label: 'Hardware' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Logs</h1>
        <p className="text-sm text-slate-400">Visualização de eventos do sistema</p>
      </div>

      {/* Filters */}
      <Card>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Select
            label="Nível"
            options={levelOptions}
            value={filters.level !== undefined ? String(filters.level) : ''}
            onChange={e => setFilters(f => ({ ...f, level: e.target.value ? Number(e.target.value) as LogLevel : undefined }))}
          />
          <Select
            label="Fonte"
            options={sourceOptions}
            value={filters.source !== undefined ? String(filters.source) : ''}
            onChange={e => setFilters(f => ({ ...f, source: e.target.value ? Number(e.target.value) as LogSource : undefined }))}
          />
          <Select
            label="Tipo"
            options={typeOptions}
            value={filters.type !== undefined ? String(filters.type) : ''}
            onChange={e => setFilters(f => ({ ...f, type: e.target.value ? Number(e.target.value) as LogType : undefined }))}
          />
          <Input
            label="Limite"
            type="number"
            value={filters.limit ?? 100}
            onChange={e => setFilters(f => ({ ...f, limit: Number(e.target.value) || 100 }))}
          />
        </div>
      </Card>

      {/* Log list */}
      {logs.isLoading ? (
        <Loading />
      ) : logs.isError ? (
        <ErrorDisplay onRetry={() => logs.refetch()} />
      ) : (
        <Card padding={false}>
          <div className="max-h-[70vh] overflow-y-auto">
            {(logs.data ?? []).length === 0 ? (
              <div className="flex h-40 items-center justify-center text-sm text-slate-500">
                Nenhum log encontrado
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {(logs.data ?? []).map(log => (
                  <LogRow key={log.id} log={log} />
                ))}
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

function LogRow({ log }: { log: LogEntry }) {
  const lvl = levelLabels[log.level] ?? { label: '?', color: 'slate' as const };

  return (
    <div className="flex items-start gap-3 px-4 py-3 hover:bg-white/5 transition-colors">
      <LogIcon level={log.level} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge color={lvl.color}>{lvl.label}</Badge>
          <Badge color="slate">{sourceLabels[log.source] ?? 'N/A'}</Badge>
          <Badge color="slate">{typeLabels[log.type] ?? 'N/A'}</Badge>
          <span className="text-xs text-slate-500">
            {new Date(log.createdAt).toLocaleString('pt-BR')}
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-200">{log.message}</p>
      </div>
    </div>
  );
}

function LogIcon({ level }: { level: LogLevel }) {
  const cls = 'h-4 w-4 shrink-0 mt-0.5';
  switch (level) {
    case LogLevel.Critical: return <Shield className={`${cls} text-danger`} />;
    case LogLevel.Error: return <AlertCircle className={`${cls} text-danger`} />;
    case LogLevel.Warning: return <AlertTriangle className={`${cls} text-warning`} />;
    case LogLevel.Debug: return <Bug className={`${cls} text-slate-500`} />;
    default: return <Info className={`${cls} text-primary`} />;
  }
}
