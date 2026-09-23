import { Monitor } from 'lucide-react';
import type { Agent } from '@/api';
import { isAgentOnlineNow } from '@/utils/agentStatus';

interface AgentMiniListProps {
  agents: Agent[];
  now: number;
  isLoading?: boolean;
  emptyMessage: string;
  onSelect: (agent: Agent) => void;
}

/** Lista compacta e acessível de agentes (padroniza ClientDetail e SiteDetail). */
export function AgentMiniList({ agents, now, isLoading, emptyMessage, onSelect }: AgentMiniListProps) {
  if (isLoading) return <p className="text-sm text-muted">Carregando...</p>;
  if (agents.length === 0) return <p className="text-sm text-muted">{emptyMessage}</p>;

  return (
    <div className="space-y-2">
      {agents.map((agent) => {
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
              <p className="text-xs text-muted">{agent.operatingSystem ?? 'N/A'}</p>
            </div>
            <span
              role="img"
              aria-label={online ? 'Online' : 'Offline'}
              className={`h-2 w-2 shrink-0 rounded-full ${online ? 'bg-success' : 'bg-slate-600'}`}
            />
          </div>
        );
      })}
    </div>
  );
}
