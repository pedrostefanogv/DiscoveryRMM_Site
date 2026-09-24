import { useMemo, useState } from 'react';
import { Monitor, Search } from 'lucide-react';
import type { Agent } from '@/api';
import { isAgentOnlineNow } from '@/utils/agentStatus';

interface AgentMiniListProps {
  agents: Agent[];
  now: number;
  isLoading?: boolean;
  emptyMessage: string;
  onSelect: (agent: Agent) => void;
  /**
   * Exibe barra de busca/filtro por status. Ativado automaticamente quando há
   * mais de alguns agentes, para não poluir o caso comum de listas curtas.
   */
  filterable?: boolean;
}

type StatusFilter = 'all' | 'online' | 'offline';

/** Lista compacta e acessível de agentes (padroniza ClientDetail e SiteDetail). */
export function AgentMiniList({
  agents,
  now,
  isLoading,
  emptyMessage,
  onSelect,
  filterable,
}: AgentMiniListProps) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');

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
      {showFilters && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
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
      )}

      <div className="space-y-2">
        {filtered.map((agent) => {
          const online = isAgentOnlineNow(agent, now);
          return (
            <div
              key={agent.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(agent)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelect(agent);
                }
              }}
              className="flex cursor-pointer items-center gap-3 rounded-lg bg-surface-light px-3 py-2 transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              <Monitor className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {agent.displayName ?? agent.hostname}
                </p>
                <p className="truncate text-xs text-muted">
                  {agent.hostname}
                  {agent.operatingSystem ? ` · ${agent.operatingSystem}` : ''}
                </p>
              </div>
              <span
                role="img"
                aria-label={online ? 'Online' : 'Offline'}
                className={`h-2 w-2 shrink-0 rounded-full ${online ? 'bg-success' : 'bg-slate-600'}`}
              />
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-sm text-muted">Nenhum agente corresponde ao filtro.</p>
        )}
      </div>
    </div>
  );
}
