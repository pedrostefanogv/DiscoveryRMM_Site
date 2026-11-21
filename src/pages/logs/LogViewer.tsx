import { useMemo, useState, type FormEvent } from 'react';
import toast from 'react-hot-toast';

import { LogLevel, LogSource, LogType } from '@/api';
import type { LogEntry, LogsQuery } from '@/api';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorDisplay,
  Icon,
  Input,
  Loading,
  PageHeader,
  Select,
  StatCard,
} from '@/components/ui';
import { useLogScopeOptions, useLogSummary, useLogsPage } from '@/hooks/useLogs';
import { getLogLevelMeta } from '@/utils/labels';
import { readDataField } from './logDataUtils';

const initialFilters: LogsQuery = {
  limit: 50,
  period: '24h',
};

const sourceLabels: Record<number, string> = {
  [LogSource.Api]: 'API',
  [LogSource.Agent]: 'Agente',
  [LogSource.Scheduler]: 'Scheduler',
  [LogSource.Nats]: 'NATS',
};

const typeLabels: Record<number, string> = {
  [LogType.Inventory]: 'Inventário',
  [LogType.Command]: 'Comando',
  [LogType.Auth]: 'Autenticação',
  [LogType.System]: 'Sistema',
  [LogType.Agent]: 'Agente',
  [LogType.Ticket]: 'Ticket',
  [LogType.Workflow]: 'Workflow',
  [LogType.AiChat]: 'AI Chat',
  [LogType.Automation]: 'Automação',
  [LogType.CustomField]: 'Campo customizado',
};

const periodQuickOptions: Array<{ value: string; label: string }> = [
  { value: '15m', label: '15m' },
  { value: '1h', label: '1h' },
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '', label: 'Manual' },
];

const periodLabels: Record<string, string> = {
  '15m': 'Últimos 15 min',
  '1h': 'Última 1h',
  '24h': 'Últimas 24h',
  '7d': 'Últimos 7 dias',
  '30d': 'Últimos 30 dias',
};

const advancedFilterKeys = new Set<keyof LogsQuery>([
  'clientId',
  'siteId',
  'agentId',
  'type',
  'traceId',
  'correlationId',
  'requestPath',
  'from',
  'to',
  'limit',
]);

const filterPresets: Array<{
  id: string;
  label: string;
  filters: LogsQuery;
  tone: 'slate' | 'primary' | 'warning' | 'danger';
}> = [
  {
    id: 'recent-errors',
    label: 'Erros 1h',
    filters: { period: '1h', level: LogLevel.Error, limit: 50 },
    tone: 'danger',
  },
  {
    id: 'auth-failures',
    label: 'Falhas auth 24h',
    filters: { period: '24h', type: LogType.Auth, level: LogLevel.Error, limit: 50 },
    tone: 'warning',
  },
  {
    id: 'nats-watch',
    label: 'NATS 24h',
    filters: { period: '24h', source: LogSource.Nats, limit: 50 },
    tone: 'primary',
  },
  {
    id: 'warn-overview',
    label: 'Warn 24h',
    filters: { period: '24h', level: LogLevel.Warn, limit: 50 },
    tone: 'slate',
  },
];

// datetime-local vem sem timezone; convertemos para ISO UTC (o backend usa
// timestamptz) sem alterar o valor exibido no input.
function toUtcIso(value?: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

function formatShare(count: number, total: number): string {
  if (!total || total <= 0) return '0%';
  return Math.round((count / total) * 100) + '%';
}

function formatDateTime(value?: string | null): string {
  if (!value) return '\u2014';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('pt-BR');
}

function normalizeFilters(filters: LogsQuery): LogsQuery {
  return {
    clientId: filters.clientId || undefined,
    siteId: filters.siteId || undefined,
    agentId: filters.agentId || undefined,
    type: filters.type,
    level: filters.level,
    source: filters.source,
    search: filters.search?.trim() || undefined,
    traceId: filters.traceId?.trim() || undefined,
    correlationId: filters.correlationId?.trim() || undefined,
    requestPath: filters.requestPath?.trim() || undefined,
    statusCode: Number.isFinite(filters.statusCode) ? filters.statusCode : undefined,
    period: filters.period || undefined,
    from: filters.period ? undefined : toUtcIso(filters.from),
    to: filters.period ? undefined : toUtcIso(filters.to),
    limit: filters.limit && filters.limit > 0 ? Math.min(filters.limit, 200) : 50,
  };
}

function parseLogData(dataJson: unknown): Record<string, unknown> | null {
  if (!dataJson) return null;

  if (typeof dataJson === 'string') {
    try {
      return JSON.parse(dataJson) as Record<string, unknown>;
    } catch {
      return { raw: dataJson };
    }
  }

  if (typeof dataJson === 'object') {
    return dataJson as Record<string, unknown>;
  }

  return null;
}

function getStringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function getNumberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function statusBadgeTone(statusCode: number): string {
  if (statusCode >= 500) return 'border-danger/40 bg-danger/10 text-danger';
  if (statusCode >= 400) return 'border-warning/40 bg-warning/10 text-warning';
  if (statusCode >= 200 && statusCode < 300) return 'border-success/30 bg-success/10 text-success';
  return 'border-border bg-surface-light text-muted-foreground';
}

export default function LogViewer() {
  const [draftFilters, setDraftFilters] = useState<LogsQuery>(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState<LogsQuery>(initialFilters);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [showDetailedAnalytics, setShowDetailedAnalytics] = useState(false);
  const [compactMode, setCompactMode] = useState(false);

  const scopeOptions = useLogScopeOptions();
  const logs = useLogsPage(appliedFilters);
  const summary = useLogSummary(appliedFilters);

  const options = scopeOptions.data;
  const sites = options?.sites ?? [];
  const agents = options?.agents ?? [];

  const clientMap = useMemo(() => new Map((options?.clients ?? []).map(item => [item.id, item])), [options?.clients]);
  const siteMap = useMemo(() => new Map(sites.map(site => [site.id, site])), [sites]);
  const agentMap = useMemo(() => new Map(agents.map(agent => [agent.id, agent])), [agents]);
  const siteLookup = useMemo(() => Object.fromEntries(sites.map(site => [site.id, site])), [sites]);
  const agentLookup = useMemo(() => Object.fromEntries(agents.map(agent => [agent.id, agent])), [agents]);

  const visibleSites = useMemo(
    () => sites.filter(site => !draftFilters.clientId || site.clientId === draftFilters.clientId),
    [sites, draftFilters.clientId],
  );
  const visibleSiteIds = useMemo(() => new Set(visibleSites.map(site => site.id)), [visibleSites]);
  const visibleAgents = useMemo(
    () =>
      agents.filter(agent => {
        if (draftFilters.siteId) return agent.siteId === draftFilters.siteId;
        if (draftFilters.clientId) return visibleSiteIds.has(agent.siteId);
        return true;
      }),
    [agents, draftFilters.siteId, draftFilters.clientId, visibleSiteIds],
  );

  const levelOptions = useMemo(
    () => [
      { value: '', label: 'Todos os níveis' },
      ...(options?.logLevels ?? []).map(option => ({ value: String(option.id), label: option.value })),
    ],
    [options?.logLevels],
  );

  const sourceOptions = useMemo(
    () => [
      { value: '', label: 'Todas as fontes' },
      ...(options?.logSources ?? []).map(option => ({
        value: String(option.id),
        label: sourceLabels[option.id] ?? option.value,
      })),
    ],
    [options?.logSources],
  );

  const typeOptions = useMemo(
    () => [
      { value: '', label: 'Todos os tipos' },
      ...(options?.logTypes ?? []).map(option => ({
        value: String(option.id),
        label: typeLabels[option.id] ?? option.value,
      })),
    ],
    [options?.logTypes],
  );

  const allLogs = useMemo(() => logs.data?.pages.flatMap(page => page.items) ?? [], [logs.data?.pages]);
  const firstPage = logs.data?.pages[0] ?? null;

  const activeFilterChips = useMemo(() => {
    const chips: Array<{ key: keyof LogsQuery; label: string }> = [];

    if (appliedFilters.clientId) {
      const clientName = clientMap.get(appliedFilters.clientId)?.name ?? appliedFilters.clientId;
      chips.push({ key: 'clientId', label: `Cliente: ${clientName}` });
    }
    if (appliedFilters.siteId) {
      const siteName = siteMap.get(appliedFilters.siteId)?.name ?? appliedFilters.siteId;
      chips.push({ key: 'siteId', label: `Site: ${siteName}` });
    }
    if (appliedFilters.agentId) {
      const agentLabel = agentMap.get(appliedFilters.agentId)?.label ?? appliedFilters.agentId;
      chips.push({ key: 'agentId', label: `Agente: ${agentLabel}` });
    }
    if (appliedFilters.level !== undefined) {
      chips.push({ key: 'level', label: `Nível: ${getLogLevelMeta(appliedFilters.level).label}` });
    }
    if (appliedFilters.source !== undefined) {
      chips.push({ key: 'source', label: `Fonte: ${sourceLabels[appliedFilters.source] ?? appliedFilters.source}` });
    }
    if (appliedFilters.type !== undefined) {
      chips.push({ key: 'type', label: `Tipo: ${typeLabels[appliedFilters.type] ?? appliedFilters.type}` });
    }
    if (appliedFilters.period) {
      chips.push({ key: 'period', label: `Período: ${periodLabels[appliedFilters.period] ?? appliedFilters.period}` });
    }
    if (appliedFilters.search) chips.push({ key: 'search', label: `Busca: ${appliedFilters.search}` });
    if (appliedFilters.traceId) chips.push({ key: 'traceId', label: `Trace: ${appliedFilters.traceId}` });
    if (appliedFilters.correlationId) chips.push({ key: 'correlationId', label: `Corr: ${appliedFilters.correlationId}` });
    if (appliedFilters.requestPath) chips.push({ key: 'requestPath', label: `Path: ${appliedFilters.requestPath}` });
    if (appliedFilters.statusCode !== undefined) chips.push({ key: 'statusCode', label: `HTTP: ${appliedFilters.statusCode}` });
    if (appliedFilters.limit && appliedFilters.limit !== 50) chips.push({ key: 'limit', label: `Limite: ${appliedFilters.limit}` });
    if (appliedFilters.from) chips.push({ key: 'from', label: `De: ${formatDateTime(appliedFilters.from)}` });
    if (appliedFilters.to) chips.push({ key: 'to', label: `Até: ${formatDateTime(appliedFilters.to)}` });

    return chips;
  }, [appliedFilters, clientMap, siteMap, agentMap]);

  const advancedActiveCount = useMemo(
    () => activeFilterChips.filter(chip => advancedFilterKeys.has(chip.key)).length,
    [activeFilterChips],
  );

  const quickStats = useMemo(() => {
    if (!summary.data) {
      return { criticalErrors: 0, warn: 0 };
    }

    const levels = new Map(summary.data.levels.map(item => [item.key.toLowerCase(), item.count]));
    return {
      criticalErrors: (levels.get('error') ?? 0) + (levels.get('fatal') ?? 0),
      warn: levels.get('warn') ?? 0,
    };
  }, [summary.data]);

  function setTextFilter<K extends keyof LogsQuery>(key: K, value: string) {
    setDraftFilters(current => ({ ...current, [key]: value || undefined }));
  }

  function applyFilters() {
    setAppliedFilters(normalizeFilters(draftFilters));
  }

  function handleFilterSubmit(event: FormEvent) {
    event.preventDefault();
    applyFilters();
  }

  function applyPatchAndRun(patch: Partial<LogsQuery>) {
    const nextDraft = { ...draftFilters, ...patch };
    const normalized = normalizeFilters(nextDraft);
    setDraftFilters(nextDraft);
    setAppliedFilters(normalized);
  }

  function selectQuickPeriod(periodValue: string) {
    if (periodValue === '') {
      setDraftFilters(current => ({ ...current, period: undefined }));
      setShowAdvancedFilters(true);
      return;
    }
    applyPatchAndRun({ period: periodValue, from: undefined, to: undefined });
  }

  function toggleLevelStatFilter(level: LogLevel) {
    const nextLevel = appliedFilters.level === level ? undefined : level;
    applyPatchAndRun({ level: nextLevel });
  }

  function clearAppliedFilter(key: keyof LogsQuery) {
    const nextValue = key === 'limit' ? 50 : undefined;
    setDraftFilters(current => ({ ...current, [key]: nextValue } as LogsQuery));
    setAppliedFilters(current => ({ ...current, [key]: nextValue } as LogsQuery));
  }

  function resetFilters() {
    setDraftFilters(initialFilters);
    setAppliedFilters(initialFilters);
    setShowAdvancedFilters(false);
  }

  function refreshData() {
    void logs.refetch();
    void summary.refetch();
    // Também atualiza as opções de escopo (clientes/sites/agentes) — antes
    // ficavam com o valor do primeiro carregamento.
    void scopeOptions.refetch();
  }

  function applyPreset(preset: LogsQuery) {
    const next = normalizeFilters({ ...initialFilters, ...preset });
    setDraftFilters(next);
    setAppliedFilters(next);
  }

  function exportLoadedLogs() {
    if (allLogs.length === 0) return;
    const blob = new Blob([JSON.stringify(allLogs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `logs-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(`${allLogs.length} evento(s) exportado(s) em JSON.`);
  }

  function handleClientChange(value: string) {
    setDraftFilters(current => ({
      ...current,
      clientId: value || undefined,
      siteId: value ? current.siteId : undefined,
      agentId: undefined,
    }));
  }

  function handleSiteChange(value: string) {
    const site = value ? siteLookup[value] : undefined;
    setDraftFilters(current => ({
      ...current,
      clientId: site?.clientId ?? current.clientId,
      siteId: value || undefined,
      agentId: undefined,
    }));
  }

  function handleAgentChange(value: string) {
    const agent = value ? agentLookup[value] : undefined;
    const site = agent ? siteLookup[agent.siteId] : undefined;
    setDraftFilters(current => ({
      ...current,
      clientId: site?.clientId ?? current.clientId,
      siteId: site?.id ?? current.siteId,
      agentId: value || undefined,
    }));
  }

  const isSyncing = logs.isFetching || summary.isFetching;
  const totalCount = summary.data ? summary.data.total : allLogs.length;
  const leaderSource = summary.data?.sources[0];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Logs"
        description="Console de observabilidade para triagem rápida, correlação de traces e investigação progressiva."
      >
        <Badge color={isSyncing ? 'warning' : 'success'} className="gap-1.5 py-1">
          <span
            className={`h-2 w-2 rounded-full ${isSyncing ? 'animate-pulse bg-warning' : 'bg-success'}`}
            aria-hidden="true"
          />
          {isSyncing ? 'Atualizando…' : 'Dados sincronizados'}
        </Badge>

        <Button
          variant="secondary"
          size="sm"
          onClick={exportLoadedLogs}
          disabled={allLogs.length === 0}
          title="Exporta os eventos atualmente carregados"
        >
          <Icon name="download" className="h-4 w-4" />
          Exportar JSON
        </Button>

        <Button variant="secondary" size="sm" onClick={refreshData} loading={isSyncing}>
          <Icon name="refresh" className="h-4 w-4" />
          Atualizar
        </Button>
      </PageHeader>

      {/* Faixa de KPIs interativa — clicar em Erros/Warn alterna o filtro */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon="article"
          label="Total no filtro"
          value={totalCount}
          tone="primary"
          trend={
            firstPage ? (
              <span className="text-xs tabular-nums text-muted">
                {allLogs.length}
                {firstPage.hasMore ? '+' : ''} carregados
              </span>
            ) : null
          }
        />
        <StatCard
          icon="error"
          label="Erros críticos"
          value={summary.data ? quickStats.criticalErrors : '—'}
          tone="warning"
          active={appliedFilters.level === LogLevel.Error}
          onClick={() => toggleLevelStatFilter(LogLevel.Error)}
          trend={
            <span className="text-[11px] text-muted">
              {appliedFilters.level === LogLevel.Error ? 'Filtrado' : 'Error + Fatal'}
            </span>
          }
        />
        <StatCard
          icon="warning"
          label="Alertas Warn"
          value={summary.data ? quickStats.warn : '—'}
          tone="accent"
          active={appliedFilters.level === LogLevel.Warn}
          onClick={() => toggleLevelStatFilter(LogLevel.Warn)}
          trend={
            <span className="text-[11px] text-muted">
              {appliedFilters.level === LogLevel.Warn ? 'Filtrado' : 'Atenção'}
            </span>
          }
        />
        <StatCard
          icon="dns"
          label="Fonte principal"
          value={leaderSource ? leaderSource.key : '—'}
          tone="success"
          trend={
            leaderSource && summary.data ? (
              <span className="text-xs tabular-nums text-muted">
                {formatShare(leaderSource.count, summary.data.total)}
              </span>
            ) : null
          }
        />
      </div>

      {/* Painel compacto de filtros + atalhos + filtros ativos */}
      <Card padding={false} className="p-4">
        <form onSubmit={handleFilterSubmit} className="space-y-3.5">
          {/* Linha superior: períodos rápidos + atalhos operacionais */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 pb-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs font-medium text-muted">Período:</span>
              {periodQuickOptions.map(option => {
                const active = (draftFilters.period ?? '') === option.value;
                return (
                  <button
                    key={option.label}
                    type="button"
                    aria-pressed={active}
                    onClick={() => selectQuickPeriod(option.value)}
                    className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                      active
                        ? 'border-primary/50 bg-primary/15 text-primary'
                        : 'border-border bg-surface-light text-muted-foreground hover:border-border-strong hover:text-foreground'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs font-medium text-muted">Atalhos:</span>
              {filterPresets.map(preset => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPreset(preset.filters)}
                  className="rounded-full transition-transform hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                >
                  <Badge color={preset.tone}>{preset.label}</Badge>
                </button>
              ))}
              <button
                type="button"
                onClick={() => applyPreset(initialFilters)}
                className="rounded-full border border-border bg-surface-light px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
              >
                Padrão
              </button>
            </div>
          </div>

          {/* Linha principal de filtros */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-12 lg:items-end">
            <div className="relative lg:col-span-5">
              <Input
                label="Busca textual"
                placeholder="Mensagem, erro ou conteúdo do DataJson (Enter para buscar)"
                value={draftFilters.search ?? ''}
                onChange={e => setTextFilter('search', e.target.value)}
                className="pl-9"
              />
              <Icon
                name="search"
                className="pointer-events-none absolute left-3 bottom-2.5 h-4 w-4 text-muted"
              />
            </div>

            <div className="lg:col-span-2">
              <Select
                label="Nível"
                options={levelOptions}
                value={draftFilters.level !== undefined ? String(draftFilters.level) : ''}
                onChange={e =>
                  setDraftFilters(f => ({
                    ...f,
                    level: e.target.value ? (Number(e.target.value) as LogLevel) : undefined,
                  }))
                }
              />
            </div>

            <div className="lg:col-span-2">
              <Select
                label="Fonte"
                options={sourceOptions}
                value={draftFilters.source !== undefined ? String(draftFilters.source) : ''}
                onChange={e =>
                  setDraftFilters(f => ({
                    ...f,
                    source: e.target.value ? (Number(e.target.value) as LogSource) : undefined,
                  }))
                }
              />
            </div>

            <div className="lg:col-span-1">
              <Input
                label="HTTP"
                type="number"
                placeholder="500"
                value={draftFilters.statusCode ?? ''}
                onChange={e =>
                  setDraftFilters(f => ({
                    ...f,
                    statusCode: e.target.value ? Number(e.target.value) : undefined,
                  }))
                }
              />
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 lg:col-span-2">
              <Button type="button" variant="ghost" size="sm" onClick={resetFilters}>
                Limpar
              </Button>
              <Button type="submit" size="sm">
                Aplicar
              </Button>
            </div>
          </div>

          {/* Toggles de painéis extras */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-3">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => setShowAdvancedFilters(current => !current)}
                aria-expanded={showAdvancedFilters ? 'true' : 'false'}
              >
                <Icon
                  name={showAdvancedFilters ? 'expand_less' : 'expand_more'}
                  className="h-4 w-4"
                />
                <span>
                  {showAdvancedFilters ? 'Ocultar filtros avançados' : 'Filtros avançados'}
                </span>
                {advancedActiveCount > 0 && (
                  <Badge color="primary">{advancedActiveCount}</Badge>
                )}
              </button>

              {summary.data && (
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                  onClick={() => setShowDetailedAnalytics(current => !current)}
                  aria-expanded={showDetailedAnalytics ? 'true' : 'false'}
                >
                  <Icon name="insert_chart" className="h-4 w-4 text-primary" />
                  <span>
                    {showDetailedAnalytics ? 'Ocultar distribuição' : 'Ver distribuição e top entidades'}
                  </span>
                </button>
              )}
            </div>

            {activeFilterChips.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {activeFilterChips.map(chip => (
                  <button
                    key={`${chip.key}-${chip.label}`}
                    type="button"
                    onClick={() => clearAppliedFilter(chip.key)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-light px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:border-border-strong hover:bg-surface-hover hover:text-foreground"
                    title="Clique para remover filtro"
                  >
                    <span>{chip.label}</span>
                    <Icon name="close" className="h-3 w-3 text-muted" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {showAdvancedFilters && (
            <div className="grid gap-3 border-t border-border/70 pt-3 sm:grid-cols-2 xl:grid-cols-4">
              <Select
                label="Cliente"
                options={[
                  { value: '', label: 'Todos os clientes' },
                  ...(options?.clients ?? []).map(client => ({ value: client.id, label: client.name })),
                ]}
                value={draftFilters.clientId ?? ''}
                onChange={e => handleClientChange(e.target.value)}
                disabled={scopeOptions.isLoading}
              />
              <Select
                label="Site"
                options={[
                  { value: '', label: 'Todos os sites' },
                  ...visibleSites.map(site => ({ value: site.id, label: site.name })),
                ]}
                value={draftFilters.siteId ?? ''}
                onChange={e => handleSiteChange(e.target.value)}
                disabled={scopeOptions.isLoading}
              />
              <Select
                label="Agente"
                options={[
                  { value: '', label: 'Todos os agentes' },
                  ...visibleAgents.map(agent => ({ value: agent.id, label: agent.label })),
                ]}
                value={draftFilters.agentId ?? ''}
                onChange={e => handleAgentChange(e.target.value)}
                disabled={scopeOptions.isLoading}
              />
              <Select
                label="Tipo"
                options={typeOptions}
                value={draftFilters.type !== undefined ? String(draftFilters.type) : ''}
                onChange={e =>
                  setDraftFilters(f => ({
                    ...f,
                    type: e.target.value ? (Number(e.target.value) as LogType) : undefined,
                  }))
                }
              />
              <Input
                label="Limite por lote"
                type="number"
                min={1}
                max={200}
                value={draftFilters.limit ?? 50}
                onChange={e => setDraftFilters(f => ({ ...f, limit: Number(e.target.value) || 50 }))}
              />
              <Input
                label="Trace ID"
                placeholder="trace-123"
                value={draftFilters.traceId ?? ''}
                onChange={e => setTextFilter('traceId', e.target.value)}
              />
              <Input
                label="Correlation ID"
                placeholder="corr-55"
                value={draftFilters.correlationId ?? ''}
                onChange={e => setTextFilter('correlationId', e.target.value)}
              />
              <Input
                label="Request Path"
                placeholder="/api/v1/auth/refresh"
                value={draftFilters.requestPath ?? ''}
                onChange={e => setTextFilter('requestPath', e.target.value)}
              />
              {!draftFilters.period && (
                <>
                  <Input
                    label="De"
                    type="datetime-local"
                    value={draftFilters.from ?? ''}
                    onChange={e => setTextFilter('from', e.target.value)}
                  />
                  <Input
                    label="Até"
                    type="datetime-local"
                    value={draftFilters.to ?? ''}
                    onChange={e => setTextFilter('to', e.target.value)}
                  />
                </>
              )}
            </div>
          )}
        </form>
      </Card>

      {/* Painel de distribuição detalhada (colapsável) */}
      {summary.data && showDetailedAnalytics && (
        <div className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-3">
            <FacetCard title="Níveis" items={summary.data.levels} total={summary.data.total} />
            <FacetCard title="Fontes" items={summary.data.sources} total={summary.data.total} />
            <FacetCard title="Tipos" items={summary.data.types} total={summary.data.total} />
          </div>
          <div className="grid gap-4 xl:grid-cols-3">
            <FacetCard
              title="Clientes (top 10)"
              items={summary.data.clients.map(item => ({ key: item.name ?? 'Desconhecido', count: item.count }))}
              total={summary.data.total}
            />
            <FacetCard
              title="Sites (top 10)"
              items={summary.data.sites.map(item => ({ key: item.name ?? 'Desconhecido', count: item.count }))}
              total={summary.data.total}
            />
            <FacetCard
              title="Agentes (top 10)"
              items={summary.data.agents.map(item => ({ key: item.name ?? 'Desconhecido', count: item.count }))}
              total={summary.data.total}
            />
          </div>
        </div>
      )}

      {/* Stream de logs */}
      {scopeOptions.isLoading && !options ? (
        <Loading />
      ) : scopeOptions.isError ? (
        <ErrorDisplay onRetry={() => scopeOptions.refetch()} />
      ) : logs.isLoading ? (
        <Loading />
      ) : logs.isError ? (
        <ErrorDisplay onRetry={() => logs.refetch()} />
      ) : (
        <Card padding={false}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge color="slate">
                {summary.data
                  ? `Mostrando ${allLogs.length} de ${summary.data.total}`
                  : `${allLogs.length} carregados`}
              </Badge>
              <span className="text-xs text-muted">
                {logs.isFetchingNextPage
                  ? 'Carregando próxima página…'
                  : firstPage?.nextCursor
                    ? 'Cursor ativo para carregar mais'
                    : 'Fim da paginação'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-lg border border-border bg-surface-light p-0.5">
                <button
                  type="button"
                  aria-pressed={!compactMode}
                  onClick={() => setCompactMode(false)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    !compactMode
                      ? 'bg-surface text-foreground shadow-sm'
                      : 'text-muted hover:text-foreground'
                  }`}
                >
                  Confortável
                </button>
                <button
                  type="button"
                  aria-pressed={compactMode}
                  onClick={() => setCompactMode(true)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    compactMode
                      ? 'bg-surface text-foreground shadow-sm'
                      : 'text-muted hover:text-foreground'
                  }`}
                >
                  Compacto
                </button>
              </div>
            </div>
          </div>

          <div className="max-h-[70vh] overflow-y-auto">
            {allLogs.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  icon="article"
                  title="Nenhum log encontrado"
                  description="Tente ampliar o período ou limpar alguns filtros ativos."
                />
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {allLogs.map(log => (
                  <LogRow
                    key={log.id}
                    log={log}
                    compact={compactMode}
                    clientName={log.clientId ? clientMap.get(log.clientId)?.name : undefined}
                    siteName={log.siteId ? siteMap.get(log.siteId)?.name : undefined}
                    agentName={log.agentId ? agentMap.get(log.agentId)?.label : undefined}
                    onQuickFilter={patch => applyPatchAndRun(patch)}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3">
            <div className="text-xs text-muted tabular-nums">
              {allLogs.length} evento(s) exibido(s)
              {summary.data ? ` de ${summary.data.total} no filtro` : ''}
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => logs.fetchNextPage()}
              disabled={!logs.hasNextPage || logs.isFetchingNextPage}
              loading={logs.isFetchingNextPage}
            >
              Carregar mais
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

function LogRow({
  log,
  compact = false,
  clientName,
  siteName,
  agentName,
  onQuickFilter,
}: {
  log: LogEntry;
  compact?: boolean;
  clientName?: string;
  siteName?: string;
  agentName?: string;
  onQuickFilter: (patch: Partial<LogsQuery>) => void;
}) {
  const [showData, setShowData] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const lvl = getLogLevelMeta(log.level);
  const data = parseLogData(log.dataJson);
  const formattedData = data ? JSON.stringify(data, null, 2) : null;
  // data_json é gravado em PascalCase pelo backend ({"Path":...,"StatusCode":...});
  // readDataField aceita as duas formas.
  const traceId = getStringValue(readDataField(data, 'traceId'));
  const correlationId = getStringValue(readDataField(data, 'correlationId'));
  const requestPath =
    getStringValue(readDataField(data, 'path')) ?? getStringValue(readDataField(data, 'requestPath'));
  const queryString = getStringValue(readDataField(data, 'queryString'));
  const statusCode = getNumberValue(readDataField(data, 'statusCode'));

  const toneClass =
    log.level === LogLevel.Error || log.level === LogLevel.Fatal
      ? 'border-l-danger'
      : log.level === LogLevel.Warn
        ? 'border-l-warning'
        : 'border-l-primary/40';

  const scopeLabel = [
    clientName ? `Cliente: ${clientName}` : null,
    siteName ? `Site: ${siteName}` : null,
    agentName ? `Agente: ${agentName}` : null,
  ]
    .filter(Boolean)
    .join(' • ');

  async function copyField(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(label);
      window.setTimeout(() => setCopiedField(current => (current === label ? null : current)), 1400);
    } catch {
      setCopiedField(null);
    }
  }

  return (
    <div
      className={`group flex items-start gap-3 border-l-4 ${
        compact ? 'px-3 py-2' : 'px-4 py-3'
      } transition-colors hover:bg-surface-light/80 ${toneClass}`}
    >
      <LogIcon level={log.level} />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge color={lvl.color}>{lvl.label}</Badge>
            <Badge color="slate">{sourceLabels[log.source] ?? 'N/A'}</Badge>
            <Badge color="slate">{typeLabels[log.type] ?? 'N/A'}</Badge>
            {statusCode !== null && (
              <button
                type="button"
                onClick={() => onQuickFilter({ statusCode })}
                className={`rounded-full border px-2 py-0.5 font-mono text-[11px] font-medium transition-opacity hover:opacity-80 ${statusBadgeTone(statusCode)}`}
                title="Filtrar por este HTTP status"
              >
                HTTP {statusCode}
              </button>
            )}
          </div>

          <span className="font-mono text-xs tabular-nums text-muted">
            {formatDateTime(log.createdAt)}
          </span>
        </div>

        <p
          className={`${compact ? 'mt-1 truncate text-xs' : 'mt-1.5 text-sm'} font-medium text-foreground`}
          title={compact ? log.message : undefined}
        >
          {log.message}
        </p>

        {scopeLabel && !compact && (
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
            <Icon name="apartment" className="h-3.5 w-3.5 shrink-0" />
            <span>{scopeLabel}</span>
          </p>
        )}

        {(traceId || correlationId || requestPath || queryString) && !compact && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted">
            {requestPath && (
              <button
                type="button"
                onClick={() => onQuickFilter({ requestPath })}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-light px-2.5 py-0.5 font-mono text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                title="Filtrar por este Request Path"
              >
                <Icon name="filter_alt" className="h-3 w-3 text-primary" />
                <span>{requestPath}</span>
              </button>
            )}

            {traceId && (
              <span className="inline-flex items-center rounded-full border border-border bg-surface-light text-[11px]">
                <button
                  type="button"
                  onClick={() => onQuickFilter({ traceId })}
                  className="inline-flex items-center gap-1 rounded-l-full px-2.5 py-0.5 font-mono text-muted-foreground transition-colors hover:text-primary"
                  title="Filtrar por este Trace ID"
                >
                  <Icon name="filter_alt" className="h-3 w-3" />
                  <span>Trace: {traceId}</span>
                </button>
                <button
                  type="button"
                  onClick={() => copyField('traceId', traceId)}
                  aria-label="Copiar Trace ID"
                  className="rounded-r-full border-l border-border px-2 py-0.5 text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
                >
                  <Icon
                    name={copiedField === 'traceId' ? 'check' : 'content_copy'}
                    className={`h-3 w-3 ${copiedField === 'traceId' ? 'text-success' : ''}`}
                  />
                </button>
              </span>
            )}

            {correlationId && (
              <span className="inline-flex items-center rounded-full border border-border bg-surface-light text-[11px]">
                <button
                  type="button"
                  onClick={() => onQuickFilter({ correlationId })}
                  className="inline-flex items-center gap-1 rounded-l-full px-2.5 py-0.5 font-mono text-muted-foreground transition-colors hover:text-primary"
                  title="Filtrar por este Correlation ID"
                >
                  <Icon name="filter_alt" className="h-3 w-3" />
                  <span>Corr: {correlationId}</span>
                </button>
                <button
                  type="button"
                  onClick={() => copyField('correlationId', correlationId)}
                  aria-label="Copiar Correlation ID"
                  className="rounded-r-full border-l border-border px-2 py-0.5 text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
                >
                  <Icon
                    name={copiedField === 'correlationId' ? 'check' : 'content_copy'}
                    className={`h-3 w-3 ${copiedField === 'correlationId' ? 'text-success' : ''}`}
                  />
                </button>
              </span>
            )}

            {queryString && (
              <span className="rounded-full border border-border bg-surface-light px-2.5 py-0.5 font-mono text-[11px]">
                Query: {queryString}
              </span>
            )}
          </div>
        )}

        {formattedData && (
          <div className="mt-2">
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs font-medium text-muted transition-colors hover:text-foreground"
              onClick={() => setShowData(current => !current)}
            >
              <Icon
                name={showData ? 'expand_less' : 'expand_more'}
                className="h-3.5 w-3.5"
              />
              <span>{showData ? 'Ocultar contexto JSON' : 'Mostrar contexto JSON'}</span>
            </button>

            {showData && (
              <div className="mt-2 overflow-hidden rounded-xl border border-border bg-surface-light/80">
                <div className="flex items-center justify-between border-b border-border px-3 py-1.5 text-[11px] text-muted">
                  <span className="font-mono">DataJson</span>
                  <button
                    type="button"
                    onClick={() => copyField('json', formattedData)}
                    className="inline-flex items-center gap-1 font-medium text-muted-foreground hover:text-foreground"
                  >
                    <Icon
                      name={copiedField === 'json' ? 'check' : 'content_copy'}
                      className={`h-3.5 w-3.5 ${copiedField === 'json' ? 'text-success' : ''}`}
                    />
                    {copiedField === 'json' ? 'Copiado' : 'Copiar JSON'}
                  </button>
                </div>
                <pre className="max-h-56 overflow-auto p-3 font-mono text-xs text-muted-foreground">
                  {formattedData}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function LogIcon({ level }: { level: LogLevel }) {
  const cls = 'h-4 w-4 shrink-0 mt-1';
  switch (level) {
    case LogLevel.Fatal:
      return <Icon name="shield" className={`${cls} text-danger`} />;
    case LogLevel.Error:
      return <Icon name="error" className={`${cls} text-danger`} />;
    case LogLevel.Warn:
      return <Icon name="warning" className={`${cls} text-warning`} />;
    case LogLevel.Trace:
      return <Icon name="refresh" className={`${cls} text-muted`} />;
    case LogLevel.Debug:
      return <Icon name="bug_report" className={`${cls} text-muted`} />;
    default:
      return <Icon name="info" className={`${cls} text-primary`} />;
  }
}

function FacetCard({
  title,
  items,
  total,
}: {
  title: string;
  items: Array<{ key: string; count: number }>;
  total: number;
}) {
  return (
    <Card>
      <CardHeader title={title} subtitle="Distribuição no filtro atual" />
      <div className="space-y-2.5">
        {items.length === 0 ? (
          <div className="text-sm text-muted">Sem dados</div>
        ) : (
          items.map(item => {
            const pct = total > 0 ? Math.min(100, Math.round((item.count / total) * 100)) : 0;
            return (
              <div
                key={item.key}
                className="space-y-1.5 rounded-xl border border-border bg-surface-light px-3 py-2 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium text-foreground">{item.key}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {item.count} ({pct}%)
                  </span>
                </div>
                <progress
                  max={100}
                  value={pct}
                  aria-label={`Proporção de ${item.key}`}
                  className="status-bar status-bar-primary"
                />
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}
