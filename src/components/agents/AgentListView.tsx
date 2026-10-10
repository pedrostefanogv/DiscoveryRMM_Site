import type { MouseEvent } from 'react';
import { ShieldCheck, Wifi, WifiOff } from 'lucide-react';
import { Badge, MetricBar } from '@/components/ui';
import { formatRelative, getAgentOsIcon, type AgentCardAgent } from './AgentCard';
import { getAgentLastSeen, isAgentOnlineNow } from '@/utils/agentStatus';

interface AgentListViewProps {
  agents: AgentCardAgent[];
  now: number;
  onOpen?: (agent: AgentCardAgent) => void;
  onContextMenu?: (event: MouseEvent<HTMLTableRowElement>, agent: AgentCardAgent) => void;
  showClient?: boolean;
  canApprove?: boolean;
  isApprovingId?: string | null;
  onApprove?: (agent: AgentCardAgent) => void;
}

/** Tabela de agentes no mesmo estilo da visualização em lista de /agents. */
export function AgentListView({
  agents,
  now,
  onOpen,
  onContextMenu,
  showClient = true,
  canApprove = false,
  isApprovingId,
  onApprove,
}: AgentListViewProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted">Agente</th>
            <th className="hidden px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted md:table-cell">Sistema Operacional</th>
            <th className="hidden px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted lg:table-cell">IP</th>
            {showClient && (
              <th className="hidden px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted sm:table-cell">Cliente</th>
            )}
            <th className="hidden px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted lg:table-cell">Usuário</th>
            <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted">Status</th>
            <th className="hidden px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted 2xl:table-cell">CPU</th>
            <th className="hidden px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted 2xl:table-cell">RAM</th>
            <th className="hidden px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted 2xl:table-cell">Leitura</th>
            <th className="hidden px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted lg:table-cell">Ping</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {agents.map(a => {
            const online = isAgentOnlineNow(a, now);
            const lastSeen = getAgentLastSeen(a);
            const displayName = a.displayName ?? a.hostname;
            const isZeroTouchPending = a.zeroTouchPending === true;
            const relativeTime = formatRelative(lastSeen, now);
            return (
              <tr
                key={a.id}
                onClick={onOpen ? () => onOpen(a) : undefined}
                onContextMenu={onContextMenu ? (event) => onContextMenu(event, a) : undefined}
                className={onOpen ? 'cursor-pointer transition-colors hover:bg-surface-light' : 'transition-colors hover:bg-surface-light'}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15">
                      {getAgentOsIcon(a.operatingSystem)}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{displayName}</p>
                      {a.displayName && a.displayName !== a.hostname && (
                        <p className="truncate font-mono text-xs text-muted">{a.hostname}</p>
                      )}
                    </div>
                  </div>
                </td>
                <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                  {a.operatingSystem ?? '—'}{a.osVersion ? ` · ${a.osVersion}` : ''}
                </td>
                <td className="hidden px-4 py-3 font-mono text-muted lg:table-cell">
                  {a.lastIpAddress ?? '—'}
                </td>
                {showClient && (
                  <td className="hidden px-4 py-3 text-muted sm:table-cell">
                    {a.clientName}
                  </td>
                )}
                <td className="hidden px-4 py-3 text-muted lg:table-cell">
                  <span className="block max-w-[14rem] truncate" title={a.loggedUser ?? undefined}>
                    {a.loggedUser?.trim() || '\u2014'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {isZeroTouchPending && canApprove && onApprove ? (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onApprove(a);
                      }}
                      disabled={isApprovingId === a.id}
                      className="inline-flex items-center gap-1 rounded-md border border-warning/40 bg-warning/10 px-2 py-1 text-xs font-medium text-warning transition-colors hover:bg-warning/20 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <ShieldCheck className="h-3.5 w-3.5" />
                      {isApprovingId === a.id ? 'Aprovando...' : 'Aprovar'}
                    </button>
                  ) : isZeroTouchPending ? (
                    <Badge color="warning">Aguardando aprovação</Badge>
                  ) : (
                    <Badge color={online ? 'success' : 'slate'}>
                      <span className="flex items-center gap-1">
                        {online ? <Wifi className="h-2.5 w-2.5" /> : <WifiOff className="h-2.5 w-2.5" />}
                        {online ? 'Online' : 'Offline'}
                      </span>
                    </Badge>
                  )}
                </td>
                <td className="hidden px-4 py-3 2xl:table-cell">
                  {a.heartbeatMetrics?.cpuPercent != null ? (
                    <MetricBar label="" value={a.heartbeatMetrics.cpuPercent} compact hideValue />
                  ) : (
                    <span className="text-xs text-muted">—</span>
                  )}
                </td>
                <td className="hidden px-4 py-3 2xl:table-cell">
                  {a.heartbeatMetrics?.memoryPercent != null ? (
                    <MetricBar label="" value={a.heartbeatMetrics.memoryPercent} compact hideValue />
                  ) : (
                    <span className="text-xs text-muted">—</span>
                  )}
                </td>
                <td className="hidden px-4 py-3 2xl:table-cell">
                  {a.heartbeatMetrics?.diskReadPercent != null ? (
                    <MetricBar label="" value={a.heartbeatMetrics.diskReadPercent} compact hideValue color="primary" />
                  ) : (
                    <span className="text-xs text-muted">—</span>
                  )}
                </td>
                <td className="hidden px-4 py-3 text-xs text-muted lg:table-cell" title={relativeTime.fullDate ?? undefined}>
                  {relativeTime.text}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
