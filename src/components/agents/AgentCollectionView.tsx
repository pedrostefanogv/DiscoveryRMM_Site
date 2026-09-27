import { useMemo, useState, type MouseEvent } from 'react';
import { LayoutGrid, List, Search } from 'lucide-react';
import { AgentCard, type AgentCardAgent } from './AgentCard';
import { AgentListView } from './AgentListView';
import { isAgentOnlineNow } from '@/utils/agentStatus';

interface AgentCollectionViewProps {
  agents: AgentCardAgent[];
  now: number;
  isLoading?: boolean;
  emptyMessage: string;
  onOpen: (agent: AgentCardAgent) => void;
  onContextMenu?: (event: MouseEvent<HTMLElement>, agent: AgentCardAgent) => void;
  showClient?: boolean;
  showSite?: boolean;
  canApprove?: boolean;
  isApprovingId?: string | null;
  onApprove?: (agent: AgentCardAgent) => void;
  /** Exibe busca/status (ativado automaticamente com mais de 1 agente). */
  filterable?: boolean;
  columnsClassName?: string;
  defaultView?: 'card' | 'list';
}

type StatusFilter = 'all' | 'online' | 'offline';

/**
 * Coleção de agentes no estilo da página /agents: filtros rápidos, alternância
 * card/lista e suporte a menu de contexto. Usada nas abas de cliente/site.
 */
export function AgentCollectionView({
  agents,
  now,
  isLoading,
  emptyMessage,
  onOpen,
  onContextMenu,
  showClient = true,
  showSite = true,
  canApprove = false,
  isApprovingId,
  onApprove,
  filterable,
  columnsClassName,
  defaultView = 'card',
}: AgentCollectionViewProps) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [viewMode, setViewMode] = useState<'card' | 'list'>(defaultView);

  const onlineCount = useMemo(
    () => agents.filter((agent) => isAgentOnlineNow(agent, now)).length,
    [agents, now],
  );
  const offlineCount = agents.length - onlineCount;

  const showFilters = (filterable ?? agents.length > 1) && agents.length > 1;

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return agents.filter((agent) => {
      const online = isAgentOnlineNow(agent, now);
      if (status === 'online' && !online) return false;
      if (status === 'offline' && online) return false;
      if (!term) return true;
      return (
        (agent.displayName ?? '').toLowerCase().includes(term) ||
        agent.hostname.toLowerCase().includes(term) ||
        (agent.operatingSystem ?? '').toLowerCase().includes(term)
      );
    });
  }, [agents, now, query, status]);

  if (isLoading) return <p className="text-sm text-muted">Carregando...</p>;
  if (agents.length === 0) return <p className="text-sm text-muted">{emptyMessage}</p>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {showFilters ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrar agentes por status">
              {([
                { value: 'all', label: `Todos (${agents.length})` },
                { value: 'online', label: `Online (${onlineCount})` },
                { value: 'offline', label: `Offline (${offlineCount})` },
              ] as { value: StatusFilter; label: string }[]).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setStatus(option.value)}
                  aria-pressed={status === option.value}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                    status === option.value
                      ? 'border-primary/40 bg-primary/15 text-primary'
                      : 'border-border text-muted-foreground hover:bg-surface-hover'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="relative sm:w-56">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted"
                aria-hidden="true"
              />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por nome ou SO"
                aria-label="Buscar agentes"
                className="w-full rounded-lg border border-border bg-surface-light py-1.5 pl-8 pr-2 text-xs text-foreground placeholder-muted transition-colors focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
              />
            </div>
          </div>
        ) : (
          <span />
        )}

        <div className="flex overflow-hidden rounded-lg border border-border">
          <button
            type="button"
            onClick={() => setViewMode('card')}
            aria-pressed={viewMode === 'card'}
            className={`flex h-9 w-9 items-center justify-center transition-colors ${viewMode === 'card' ? 'bg-primary/20 text-primary' : 'bg-surface-light text-muted hover:text-foreground'}`}
            title="Visualização em cards"
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setViewMode('list')}
            aria-pressed={viewMode === 'list'}
            className={`flex h-9 w-9 items-center justify-center transition-colors ${viewMode === 'list' ? 'bg-primary/20 text-primary' : 'bg-surface-light text-muted hover:text-foreground'}`}
            title="Visualização em lista"
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted">Nenhum agente corresponde ao filtro.</p>
      ) : viewMode === 'list' ? (
        <AgentListView
          agents={filtered}
          now={now}
          onOpen={onOpen}
          onContextMenu={onContextMenu}
          showClient={showClient}
          canApprove={canApprove}
          isApprovingId={isApprovingId}
          onApprove={onApprove}
        />
      ) : (
        <div className={columnsClassName ?? 'grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3'}>
          {filtered.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              now={now}
              onOpen={onOpen}
              onContextMenu={onContextMenu}
              showClient={showClient}
              showSite={showSite}
              canApprove={canApprove}
              isApproving={isApprovingId === agent.id}
              onApprove={onApprove}
            />
          ))}
        </div>
      )}
    </div>
  );
}
