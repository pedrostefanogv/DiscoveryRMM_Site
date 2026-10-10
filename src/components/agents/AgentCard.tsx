import type { KeyboardEvent, MouseEvent } from 'react';
import {
  Activity,
  Apple,
  ArrowDown,
  ArrowUp,
  Building2,
  Clock,
  HardDrive,
  MapPin,
  Monitor,
  Radio,
  Server,
  ShieldCheck,
  Thermometer,
  User,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { Badge, MetricBar } from '@/components/ui';
import type { Agent } from '@/api';
import { getAgentLastSeen, isAgentOnlineNow } from '@/utils/agentStatus';

/** Agente com cliente/site já resolvidos para exibição. */
export type AgentCardAgent = Agent & { clientName: string; clientId: string; siteName?: string };

/** Ícone do SO usado no card (extraído do AgentList para reuso). */
export function getAgentOsIcon(os: string | null | undefined) {
  if (!os) return <Monitor className="h-5 w-5 text-primary" />;
  const lower = os.toLowerCase();
  if (lower.includes('windows')) return <Monitor className="h-5 w-5 text-primary" />;
  if (lower.includes('linux') || lower.includes('ubuntu') || lower.includes('debian') || lower.includes('centos')) {
    return <Server className="h-5 w-5 text-accent" />;
  }
  if (lower.includes('mac') || lower.includes('darwin')) return <Apple className="h-5 w-5 text-foreground" />;
  return <Monitor className="h-5 w-5 text-primary" />;
}

export function formatDateBrazil(value: string): string {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return value;
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatRelative(dateStr: string | null, now: number): { text: string; fullDate: string | null } {
  if (!dateStr) return { text: '—', fullDate: null };
  const diff = now - new Date(dateStr).getTime();
  const fullDate = formatDateBrazil(dateStr);
  if (diff < 60_000) return { text: 'agora mesmo', fullDate };
  if (diff < 3_600_000) return { text: `há ${Math.floor(diff / 60_000)} min`, fullDate };
  if (diff < 86_400_000) return { text: `há ${Math.floor(diff / 3_600_000)} h`, fullDate };
  return { text: fullDate, fullDate };
}

interface AgentCardProps {
  agent: AgentCardAgent;
  now: number;
  onOpen?: (agent: AgentCardAgent) => void;
  onContextMenu?: (event: MouseEvent<HTMLDivElement>, agent: AgentCardAgent) => void;
  /** Exibe o nome do cliente (ocultar quando a lista já é de um único cliente). */
  showClient?: boolean;
  /** Exibe o nome do site (ocultar quando a aba já é de um único cliente/site). */
  showSite?: boolean;
  canApprove?: boolean;
  isApproving?: boolean;
  onApprove?: (agent: AgentCardAgent) => void;
}

/**
 * Card de agente no mesmo estilo da listagem geral (/agents). Reutilizado na
 * página de agentes e na aba "Agentes" do cliente/site.
 */
export function AgentCard({
  agent,
  now,
  onOpen,
  onContextMenu,
  showClient = true,
  showSite = true,
  canApprove = false,
  isApproving = false,
  onApprove,
}: AgentCardProps) {
  const online = isAgentOnlineNow(agent, now);
  const lastSeen = getAgentLastSeen(agent);
  const displayName = agent.displayName ?? agent.hostname;
  const isZeroTouchPending = agent.zeroTouchPending === true;
  const relativeTime = formatRelative(lastSeen, now);

  return (
    <div
      onClick={onOpen ? () => onOpen(agent) : undefined}
      onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
        if (!onOpen) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen(agent);
        }
      }}
      onContextMenu={onContextMenu ? (event) => onContextMenu(event, agent) : undefined}
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      className="group relative flex flex-col gap-4 rounded-xl border border-border bg-surface p-5 text-left transition-all hover:border-primary/30 hover:bg-surface-light hover:shadow-lg"
    >
      <div className="absolute right-4 top-4">
        <Badge color={online ? 'success' : 'slate'}>
          <span className="flex items-center gap-1">
            {online ? <Wifi className="h-2.5 w-2.5" /> : <WifiOff className="h-2.5 w-2.5" />}
            {online ? 'Online' : 'Offline'}
          </span>
        </Badge>
      </div>
      <div className="flex items-start gap-3 pr-6">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/15">
          {getAgentOsIcon(agent.operatingSystem)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-foreground transition-colors group-hover:text-primary">{displayName}</p>
          {agent.displayName && agent.displayName !== agent.hostname && (
            <p className="truncate font-mono text-xs text-muted">{agent.hostname}</p>
          )}
          {isZeroTouchPending && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Badge color="warning">Aguardando aprovação</Badge>
            </div>
          )}
        </div>
      </div>
      <div className="space-y-1.5 text-xs">
        <div className="flex items-center gap-2 text-muted">
          <Activity className="h-3.5 w-3.5 shrink-0 text-muted" />
          <span className="truncate">{agent.operatingSystem ?? '—'}{agent.osVersion ? ` · ${agent.osVersion}` : ''}</span>
        </div>
        <div className="flex items-center gap-2 text-muted">
          <span className="h-3.5 w-3.5 shrink-0 pt-px text-center font-mono text-[10px] leading-none text-muted">IP</span>
          <span className="font-mono">{agent.lastIpAddress ?? 'IP indisponível'}</span>
        </div>
        {/* Cliente → Site → Usuário logado, na mesma linha. */}
        <div className="flex min-w-0 items-center gap-2 text-muted">
          {showClient && <Building2 className="h-3.5 w-3.5 shrink-0 text-muted" />}
          {showClient && <span className="truncate">{agent.clientName}</span>}
          {showClient && showSite && agent.siteName && <span className="text-muted/50">·</span>}
          {showSite && agent.siteName && (
            <>
              <MapPin className="h-3 w-3 shrink-0 text-muted" />
              <span className="truncate">{agent.siteName}</span>
            </>
          )}
          {(showClient || (showSite && agent.siteName)) && <span className="text-muted/50">·</span>}
          <User className="h-3.5 w-3.5 shrink-0 text-muted" />
          <span
            className="truncate"
            title={
              agent.loggedUser?.trim()
                ? `Usuário logado: ${agent.loggedUser}`
                : 'Sem usuário logado reportado'
            }
          >
            {agent.loggedUser?.trim() || '\u2014'}
          </span>
          {agent.loggedUser?.trim() && agent.loggedUserSince && (
            <span
              className="shrink-0 text-[10px] text-muted/70"
              title={`Sessão iniciada em ${formatRelative(agent.loggedUserSince, now).fullDate ?? agent.loggedUserSince}`}
            >
              {formatRelative(agent.loggedUserSince, now).text}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-muted pt-0.5">
          {agent.heartbeatMetrics?.p2pPeers != null && (
            <span className="flex items-center gap-1 text-[10px]">
              <Radio className="h-3 w-3" />
              {agent.heartbeatMetrics.p2pPeers} peers
            </span>
          )}
          <span className="flex items-center gap-1 text-[10px]">
            <Clock className="h-3 w-3" />
            {relativeTime.text}
          </span>
          {agent.heartbeatMetrics?.cpuTemperatureCelsius != null && (() => {
            const t = agent.heartbeatMetrics.cpuTemperatureCelsius;
            const tempColor = t > 80 ? 'text-danger' : t > 60 ? 'text-warning' : '';
            return (
              <span className={`flex items-center gap-1 text-[10px] ${tempColor}`}>
                <Thermometer className="h-3 w-3" />
                {Math.round(t)}°C
              </span>
            );
          })()}
          {agent.heartbeatMetrics?.diskPercent != null && (() => {
            const pct = agent.heartbeatMetrics.diskPercent;
            const colorClass = pct >= 90 ? 'text-danger' : pct >= 70 ? 'text-warning' : '';
            return (
              <span className={`flex items-center gap-1 text-[10px] ${colorClass}`}>
                <HardDrive className="h-3 w-3" />
                {Math.round(pct)}%
              </span>
            );
          })()}
        </div>
        {agent.heartbeatMetrics && (
          <div className="border-t border-border pt-2 mt-1 space-y-1.5">
            <MetricBar label="CPU" value={agent.heartbeatMetrics.cpuPercent} compact />
            <MetricBar label="RAM" value={agent.heartbeatMetrics.memoryPercent} compact />
            {(agent.heartbeatMetrics.diskReadPercent != null || agent.heartbeatMetrics.diskWritePercent != null) && (
              <div className="flex items-stretch gap-2">
                <span className="shrink-0 text-xs text-muted min-w-[2rem]">HDD</span>
                <div className="flex flex-1 items-center gap-1.5">
                  <ArrowUp className="h-3 w-3 shrink-0 text-cyan-600 dark:text-cyan-400" />
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-cyan-500/20">
                    <div
                      className="h-full rounded-full bg-cyan-500 transition-all duration-500"
                      style={{ width: `${Math.min(100, Math.max(0, agent.heartbeatMetrics.diskReadPercent ?? 0))}%` }}
                    />
                  </div>
                  <span className="shrink-0 text-[10px] font-medium tabular-nums text-cyan-600 dark:text-cyan-400">
                    {agent.heartbeatMetrics.diskReadPercent != null ? `${Math.round(agent.heartbeatMetrics.diskReadPercent)}%` : '—'}
                  </span>
                </div>
                <div className="flex flex-1 items-center gap-1.5">
                  <ArrowDown className="h-3 w-3 shrink-0 text-amber-600 dark:text-amber-400" />
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-amber-500/20">
                    <div
                      className="h-full rounded-full bg-amber-500 transition-all duration-500"
                      style={{ width: `${Math.min(100, Math.max(0, agent.heartbeatMetrics.diskWritePercent ?? 0))}%` }}
                    />
                  </div>
                  <span className="shrink-0 text-[10px] font-medium tabular-nums text-amber-600 dark:text-amber-400">
                    {agent.heartbeatMetrics.diskWritePercent != null ? `${Math.round(agent.heartbeatMetrics.diskWritePercent)}%` : '—'}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      {canApprove && isZeroTouchPending && onApprove && (
        <div className="pt-1">
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onApprove(agent);
            }}
            disabled={isApproving}
            className="inline-flex items-center gap-1 rounded-md border border-warning/40 bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning transition-colors hover:bg-warning/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            {isApproving ? 'Aprovando...' : 'Aprovar'}
          </button>
        </div>
      )}
    </div>
  );
}
