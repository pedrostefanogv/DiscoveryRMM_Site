import { useState, useMemo } from 'react';
import { AlertTriangle, Info, AlertCircle, Bug, Shield, RefreshCw, ChevronDown, ChevronUp, Clipboard, Check } from 'lucide-react';
import { useLogScopeOptions, useLogSummary, useLogsPage } from '@/hooks/useLogs';
import { Card, CardHeader, Badge, Loading, ErrorDisplay, Select, Input, Button } from '@/components/ui';
import { LogLevel, LogSource, LogType } from '@/api';
import type { LogsQuery, LogEntry } from '@/api';

const initialFilters: LogsQuery = {
  limit: 50,
  period: '24h',
};

const levelLabels: Record<number, { label: string; color: 'slate' | 'primary' | 'warning' | 'danger' | 'accent' }> = {
  [LogLevel.Trace]: { label: 'Trace', color: 'slate' },
  [LogLevel.Debug]: { label: 'Debug', color: 'slate' },
  [LogLevel.Info]: { label: 'Info', color: 'primary' },
  [LogLevel.Warn]: { label: 'Warn', color: 'warning' },
  [LogLevel.Error]: { label: 'Error', color: 'danger' },
  [LogLevel.Fatal]: { label: 'Fatal', color: 'danger' },
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

const periodOptions = [
  { value: '', label: 'Período manual' },
  { value: '15m', label: 'Últimos 15 min' },
  { value: '1h', label: 'Última 1h' },
  { value: '24h', label: 'Últimas 24h' },
  { value: '7d', label: 'Últimos 7 dias' },
  { value: '30d', label: 'Últimos 30 dias' },
];

const periodLabels: Record<string, string> = {
  '15m': 'Últimos 15 min',
  '1h': 'Última 1h',
  '24h': 'Últimas 24h',
  '7d': 'Últimos 7 dias',
  '30d': 'Últimos 30 dias',
};

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
    from: filters.from || undefined,
    to: filters.to || undefined,
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

// buildSiteLookup/buildAgentLookup now inline via useMemo inside component

export default function LogViewer() {
  const [draftFilters, setDraftFilters] = useState<LogsQuery>(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState<LogsQuery>(initialFilters);

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
    () => agents.filter(agent => {
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
      ...(options?.logSources ?? []).map(option => ({ value: String(option.id), label: sourceLabels[option.id] ?? option.value })),
    ],
    [options?.logSources],
  );

  const typeOptions = useMemo(
    () => [
      { value: '', label: 'Todos os tipos' },
      ...(options?.logTypes ?? []).map(option => ({ value: String(option.id), label: typeLabels[option.id] ?? option.value })),
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
      chips.push({ key: 'level', label: `Nível: ${levelLabels[appliedFilters.level]?.label ?? appliedFilters.level}` });
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
    if (appliedFilters.from) chips.push({ key: 'from', label: `De: ${appliedFilters.from}` });
    if (appliedFilters.to) chips.push({ key: 'to', label: `Até: ${appliedFilters.to}` });
    return chips;
  }, [appliedFilters, clientMap, siteMap, agentMap]);

  function setTextFilter<K extends keyof LogsQuery>(key: K, value: string) {
    setDraftFilters(current => ({ ...current, [key]: value || undefined }));
  }

  function applyFilters() {
    setAppliedFilters(normalizeFilters(draftFilters));
  }

  function clearAppliedFilter(key: keyof LogsQuery) {
    setDraftFilters(current => ({ ...current, [key]: undefined }));
    setAppliedFilters(current => ({ ...current, [key]: undefined }));
  }

  function resetFilters() {
    setDraftFilters(initialFilters);
    setAppliedFilters(initialFilters);
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Logs</h1>
        <p className="text-sm text-slate-400">Consulta operacional com escopo, filtros avançados e paginação por cursor</p>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-slate-400">
            {summary.data ? `${summary.data.total} eventos no filtro atual` : `${allLogs.length} eventos carregados`}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => { logs.refetch(); summary.refetch(); }}>
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </Button>
            <Button variant="secondary" onClick={applyFilters}>Reaplicar</Button>
          </div>
        </div>
      </Card>

      {summary.data ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard title="Total no filtro" value={String(summary.data.total)} hint={summary.data.period ? `Janela ${summary.data.period}` : 'Período manual'} />
          <StatCard title="Nível líder" value={summary.data.levels[0]?.key ?? 'N/A'} hint={summary.data.levels[0] ? `${summary.data.levels[0].count} ocorrências` : 'Sem dados'} />
          <StatCard title="Fonte líder" value={summary.data.sources[0]?.key ?? 'N/A'} hint={summary.data.sources[0] ? `${summary.data.sources[0].count} ocorrências` : 'Sem dados'} />
          <StatCard title="Tipo líder" value={summary.data.types[0]?.key ?? 'N/A'} hint={summary.data.types[0] ? `${summary.data.types[0].count} ocorrências` : 'Sem dados'} />
        </div>
      ) : null}

      <Card>
        <CardHeader
          title="Filtros"
          subtitle="Os selects de cliente, site e agente já respeitam o escopo retornado pelo backend."
          action={
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={resetFilters}>Limpar</Button>
              <Button onClick={applyFilters}>Aplicar filtros</Button>
            </div>
          }
        />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Select
            label="Cliente"
            options={[{ value: '', label: 'Todos os clientes' }, ...(options?.clients ?? []).map(client => ({ value: client.id, label: client.name }))]}
            value={draftFilters.clientId ?? ''}
            onChange={e => handleClientChange(e.target.value)}
            disabled={scopeOptions.isLoading}
          />
          <Select
            label="Site"
            options={[{ value: '', label: 'Todos os sites' }, ...visibleSites.map(site => ({ value: site.id, label: site.name }))]}
            value={draftFilters.siteId ?? ''}
            onChange={e => handleSiteChange(e.target.value)}
            disabled={scopeOptions.isLoading}
          />
          <Select
            label="Agente"
            options={[{ value: '', label: 'Todos os agentes' }, ...visibleAgents.map(agent => ({ value: agent.id, label: agent.label }))]}
            value={draftFilters.agentId ?? ''}
            onChange={e => handleAgentChange(e.target.value)}
            disabled={scopeOptions.isLoading}
          />
          <Select
            label="Período"
            options={periodOptions}
            value={draftFilters.period ?? ''}
            onChange={e => setTextFilter('period', e.target.value)}
          />
          {draftFilters.period ? null : (
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
          <Select
            label="Nível"
            options={levelOptions}
            value={draftFilters.level !== undefined ? String(draftFilters.level) : ''}
            onChange={e => setDraftFilters(f => ({ ...f, level: e.target.value ? Number(e.target.value) as LogLevel : undefined }))}
          />
          <Select
            label="Fonte"
            options={sourceOptions}
            value={draftFilters.source !== undefined ? String(draftFilters.source) : ''}
            onChange={e => setDraftFilters(f => ({ ...f, source: e.target.value ? Number(e.target.value) as LogSource : undefined }))}
          />
          <Select
            label="Tipo"
            options={typeOptions}
            value={draftFilters.type !== undefined ? String(draftFilters.type) : ''}
            onChange={e => setDraftFilters(f => ({ ...f, type: e.target.value ? Number(e.target.value) as LogType : undefined }))}
          />
          <Input
            label="Limite"
            type="number"
            min={1}
            max={200}
            value={draftFilters.limit ?? 50}
            onChange={e => setDraftFilters(f => ({ ...f, limit: Number(e.target.value) || 50 }))}
          />
          <Input
            label="Busca textual"
            placeholder="Mensagem ou conteúdo do DataJson"
            value={draftFilters.search ?? ''}
            onChange={e => setTextFilter('search', e.target.value)}
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
          <Input
            label="Status Code"
            type="number"
            placeholder="500"
            value={draftFilters.statusCode ?? ''}
            onChange={e => setDraftFilters(f => ({ ...f, statusCode: e.target.value ? Number(e.target.value) : undefined }))}
          />
        </div>
      </Card>

      {activeFilterChips.length > 0 ? (
        <Card>
          <div className="mb-3 text-xs uppercase tracking-wide text-slate-500">Filtros ativos</div>
          <div className="flex flex-wrap gap-2">
            {activeFilterChips.map(chip => (
              <button
                key={`${chip.key}-${chip.label}`}
                type="button"
                onClick={() => clearAppliedFilter(chip.key)}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300 hover:bg-white/10"
              >
                <span>{chip.label}</span>
                <span className="text-slate-500">x</span>
              </button>
            ))}
          </div>
        </Card>
      ) : null}

      {summary.data ? (
        <div className="grid gap-4 xl:grid-cols-3">
          <FacetCard title="Níveis" items={summary.data.levels} />
          <FacetCard title="Fontes" items={summary.data.sources} />
          <FacetCard title="Tipos" items={summary.data.types} />
        </div>
      ) : null}

      {summary.data ? (
        <div className="grid gap-4 xl:grid-cols-3">
          <FacetCard title="Clientes (top)" items={summary.data.clients.map(item => ({ key: item.name ?? 'Desconhecido', count: item.count }))} />
          <FacetCard title="Sites (top)" items={summary.data.sites.map(item => ({ key: item.name ?? 'Desconhecido', count: item.count }))} />
          <FacetCard title="Agentes (top)" items={summary.data.agents.map(item => ({ key: item.name ?? 'Desconhecido', count: item.count }))} />
        </div>
      ) : null}

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
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 text-sm text-slate-400">
            <span>{summary.data ? `${summary.data.total} logs no filtro` : `${allLogs.length} logs carregados`}</span>
            <span>{firstPage ? `Lote ${allLogs.length}${firstPage.hasMore ? '+' : ''}` : 'Sem paginação ativa'}</span>
          </div>
          <div className="max-h-[70vh] overflow-y-auto">
            {allLogs.length === 0 ? (
              <div className="flex h-40 items-center justify-center text-sm text-slate-500">
                Nenhum log encontrado
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {allLogs.map(log => (
                  <LogRow
                    key={log.id}
                    log={log}
                    clientName={log.clientId ? clientMap.get(log.clientId)?.name : undefined}
                    siteName={log.siteId ? siteMap.get(log.siteId)?.name : undefined}
                    agentName={log.agentId ? agentMap.get(log.agentId)?.label : undefined}
                  />
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center justify-between border-t border-white/10 px-4 py-3">
            <div className="text-sm text-slate-400">
              {firstPage?.nextCursor ? 'Cursor disponível para próxima página' : 'Fim da paginação'}
            </div>
            <Button
              variant="secondary"
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
  clientName,
  siteName,
  agentName,
}: {
  log: LogEntry;
  clientName?: string;
  siteName?: string;
  agentName?: string;
}) {
  const [showData, setShowData] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const lvl = levelLabels[log.level] ?? { label: '?', color: 'slate' as const };
  const data = parseLogData(log.dataJson);
  const formattedData = data ? JSON.stringify(data, null, 2) : null;
  const traceId = getStringValue(data?.traceId);
  const correlationId = getStringValue(data?.correlationId);
  const requestPath = getStringValue(data?.path) ?? getStringValue(data?.requestPath);
  const queryString = getStringValue(data?.queryString);
  const statusCode = getNumberValue(data?.statusCode);

  async function copyField(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(label);
      window.setTimeout(() => setCopiedField(current => (current === label ? null : current)), 1200);
    } catch {
      setCopiedField(null);
    }
  }

  return (
    <div className="flex items-start gap-3 px-4 py-3 hover:bg-white/5 transition-colors">
      <LogIcon level={log.level} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge color={lvl.color}>{lvl.label}</Badge>
          <Badge color="slate">{sourceLabels[log.source] ?? 'N/A'}</Badge>
          <Badge color="slate">{typeLabels[log.type] ?? 'N/A'}</Badge>
          {clientName ? <Badge color="slate">Cliente: {clientName}</Badge> : null}
          {siteName ? <Badge color="slate">Site: {siteName}</Badge> : null}
          {agentName ? <Badge color="slate">Agente: {agentName}</Badge> : null}
          <span className="text-xs text-slate-500">
            {new Date(log.createdAt).toLocaleString('pt-BR')}
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-200">{log.message}</p>
        {(traceId || correlationId || requestPath || statusCode !== null || queryString) ? (
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-400">
            {statusCode !== null ? <span className="rounded-full border border-white/10 px-2 py-1">HTTP {statusCode}</span> : null}
            {requestPath ? <span className="rounded-full border border-white/10 px-2 py-1">{requestPath}</span> : null}
            {traceId ? (
              <button type="button" onClick={() => copyField('traceId', traceId)} className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2 py-1 hover:bg-white/10">
                <span>Trace: {traceId}</span>
                {copiedField === 'traceId' ? <Check className="h-3.5 w-3.5 text-success" /> : <Clipboard className="h-3.5 w-3.5" />}
              </button>
            ) : null}
            {correlationId ? (
              <button type="button" onClick={() => copyField('correlationId', correlationId)} className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2 py-1 hover:bg-white/10">
                <span>Corr: {correlationId}</span>
                {copiedField === 'correlationId' ? <Check className="h-3.5 w-3.5 text-success" /> : <Clipboard className="h-3.5 w-3.5" />}
              </button>
            ) : null}
            {queryString ? <span className="rounded-full border border-white/10 px-2 py-1">Query: {queryString}</span> : null}
          </div>
        ) : null}
        {formattedData ? (
          <div className="mt-2">
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200"
              onClick={() => setShowData(current => !current)}
            >
              {showData ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              <span>{showData ? 'Ocultar contexto JSON' : 'Mostrar contexto JSON'}</span>
            </button>
            {showData ? (
              <pre className="mt-2 max-h-52 overflow-auto rounded-xl border border-white/10 bg-slate-950/60 p-3 text-xs text-slate-300">
                {formattedData}
              </pre>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function LogIcon({ level }: { level: LogLevel }) {
  const cls = 'h-4 w-4 shrink-0 mt-0.5';
  switch (level) {
    case LogLevel.Fatal: return <Shield className={`${cls} text-danger`} />;
    case LogLevel.Error: return <AlertCircle className={`${cls} text-danger`} />;
    case LogLevel.Warn: return <AlertTriangle className={`${cls} text-warning`} />;
    case LogLevel.Trace: return <RefreshCw className={`${cls} text-slate-500`} />;
    case LogLevel.Debug: return <Bug className={`${cls} text-slate-500`} />;
    default: return <Info className={`${cls} text-primary`} />;
  }
}

function FacetCard({ title, items }: { title: string; items: Array<{ key: string; count: number }> }) {
  return (
    <Card>
      <CardHeader title={title} subtitle="Distribuição no filtro atual" />
      <div className="space-y-2">
        {items.length === 0 ? (
          <div className="text-sm text-slate-500">Sem dados</div>
        ) : items.map(item => (
          <div key={item.key} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm">
            <span className="text-slate-200">{item.key}</span>
            <Badge color="slate">{item.count}</Badge>
          </div>
        ))}
      </div>
    </Card>
  );
}

function StatCard({ title, value, hint }: { title: string; value: string; hint: string }) {
  return (
    <Card>
      <div className="text-sm text-slate-400">{title}</div>
      <div className="mt-2 text-3xl font-semibold text-white">{value}</div>
      <div className="mt-2 text-xs text-slate-500">{hint}</div>
    </Card>
  );
}
