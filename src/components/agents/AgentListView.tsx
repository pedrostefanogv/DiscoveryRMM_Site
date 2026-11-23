import { useEffect, useRef, type MouseEvent } from 'react';
import { agentRebootTooltip, hasPendingReboot } from '@/utils/agentReboot';
import { Icon, Badge, MetricBar } from '@/components/ui';
import {
  formatRelative,
  getAgentDeviceIcon,
  getAgentDeviceIconBoxClass,
  type AgentCardAgent,
} from './AgentCard';
import { getAgentLastSeen, isAgentOnlineNow } from '@/utils/agentStatus';
import { batteryFromMetrics, machineTypeLabel } from '@/utils/agentPower';
import { BatteryGauge } from '@/components/ui';

interface AgentListViewProps {
  agents: AgentCardAgent[];
  now: number;
  onOpen?: (agent: AgentCardAgent) => void;
  onContextMenu?: (event: MouseEvent<HTMLTableRowElement>, agent: AgentCardAgent) => void;
  showClient?: boolean;
  canApprove?: boolean;
  isApprovingId?: string | null;
  onApprove?: (agent: AgentCardAgent) => void;
  /**
   * Coluna opcional de campo customizado: rótulo + valor por agente. Só aparece
   * quando a lista tem um campo selecionado para filtro/coluna.
   */
  customField?: {
    label: string;
    valuesByAgentId: Map<string, string>;
  };
  /** Habilita a coluna de seleção múltipla (ações em massa da aba Agentes). */
  selectable?: boolean;
  selectedIds?: ReadonlySet<string>;
  onToggleSelect?: (agent: AgentCardAgent, next: boolean) => void;
  onToggleSelectAll?: (agents: readonly AgentCardAgent[], next: boolean) => void;
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
  customField,
  selectable = false,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
}: AgentListViewProps) {
  const selectedCount = selectable
    ? agents.filter((agent) => selectedIds?.has(agent.id)).length
    : 0;
  const allSelected = selectable && agents.length > 0 && selectedCount === agents.length;
  const someSelected = selectedCount > 0 && !allSelected;

  // Estado "indeterminado" do checkbox do cabeçalho: só existe no DOM (não é um
  // atributo HTML), então precisa ser sincronizado à mão a cada render.
  const selectAllRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someSelected;
  }, [someSelected]);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            {selectable && (
              <th className="w-10 px-4 py-3">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  checked={allSelected}
                  onChange={(event) => onToggleSelectAll?.(agents, event.target.checked)}
                  aria-label="Selecionar todos os agentes"
                  className="h-4 w-4 cursor-pointer rounded border-border-strong bg-surface-light text-primary focus:ring-primary/30"
                />
              </th>
            )}
            <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted">Agente</th>
            <th className="hidden px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted md:table-cell">Sistema Operacional</th>
            <th className="hidden px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted lg:table-cell">IP</th>
            {showClient && (
              <th className="hidden px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted sm:table-cell">Cliente</th>
            )}
            <th className="hidden px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted lg:table-cell">Usuário</th>
            {customField && (
              <th className="hidden px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted xl:table-cell">
                {customField.label}
              </th>
            )}
            <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted">Status</th>
            <th className="hidden w-[7rem] px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted 2xl:table-cell">CPU</th>
            <th className="hidden w-[7rem] px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted 2xl:table-cell">RAM</th>
            <th className="hidden w-[7rem] px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted 2xl:table-cell">Leitura</th>
            <th className="hidden px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted lg:table-cell">Ping</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-black/10 dark:divide-white/5">
          {agents.map(a => {
            const online = isAgentOnlineNow(a, now);
            const lastSeen = getAgentLastSeen(a);
            const displayName = a.displayName ?? a.hostname;
            const isZeroTouchPending = a.zeroTouchPending === true;
            const relativeTime = formatRelative(lastSeen, now);
            // Mesma regra do card: o notebook é distinguido pelo ÍCONE (o selo
            // textual saiu) e a energia só aparece quando o heartbeat reportou
            // presença de bateria.
            const deviceTypeLabel = machineTypeLabel(a);
            const battery = batteryFromMetrics(a.heartbeatMetrics);
            return (
              <tr
                key={a.id}
                onClick={onOpen ? () => onOpen(a) : undefined}
                onContextMenu={onContextMenu ? (event) => onContextMenu(event, a) : undefined}
                data-selected={selectable && selectedIds?.has(a.id) ? 'true' : undefined}
                className={`transition-colors ${onOpen ? 'cursor-pointer' : ''} ${
                  // Selecionado e hover usam a MESMA propriedade: manter as duas
                  // classes deixava a de hover vencer e a linha selecionada
                  // "apagava" ao passar o mouse.
                  selectable && selectedIds?.has(a.id)
                    ? 'bg-primary/5 hover:bg-primary/10'
                    : 'hover:bg-surface-light'
                }`}
              >
                {selectable && (
                  <td className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds?.has(a.id) ?? false}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) => onToggleSelect?.(a, event.target.checked)}
                      aria-label={`Selecionar ${displayName}`}
                      className="h-4 w-4 cursor-pointer rounded border-border-strong bg-surface-light text-primary focus:ring-primary/30"
                    />
                  </td>
                )}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${getAgentDeviceIconBoxClass(a)}`}
                      title={deviceTypeLabel ? `Dispositivo: ${deviceTypeLabel}` : undefined}
                    >
                      {/* Mesma regra do card: servidor > notebook/tablet > SO. */}
                      {getAgentDeviceIcon(a)}
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
                {customField && (
                  <td className="hidden px-4 py-3 text-muted-foreground xl:table-cell">
                    <span className="block max-w-[14rem] truncate" title={customField.valuesByAgentId.get(a.id) ?? undefined}>
                      {customField.valuesByAgentId.get(a.id) || '\u2014'}
                    </span>
                  </td>
                )}
                <td className="px-4 py-3">
                  {battery && (
                    <span className="mr-1 inline-flex align-middle">
                      <BatteryGauge
                        percent={battery.percent}
                        onAc={battery.onAc}
                        charging={battery.charging}
                      />
                    </span>
                  )}
                  {hasPendingReboot(a) && (
                    <span className="mr-1 inline-flex" title={agentRebootTooltip(a.pendingRebootReasons)}>
                      <Badge color="warning">
                        <span className="flex items-center gap-1">
                          <Icon name="restart_alt" className="h-2.5 w-2.5" />
                          Reinício pendente
                        </span>
                      </Badge>
                    </span>
                  )}
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
                      <Icon name="verified_user" className="h-3.5 w-3.5" />
                      {isApprovingId === a.id ? 'Aprovando...' : 'Aprovar'}
                    </button>
                  ) : isZeroTouchPending ? (
                    <Badge color="warning">Aguardando aprovação</Badge>
                  ) : (
                    <Badge color={online ? 'success' : 'slate'}>
                      <span className="flex items-center gap-1">
                        {online ? <Icon name="wifi" className="h-2.5 w-2.5" /> : <Icon name="wifi_off" className="h-2.5 w-2.5" />}
                        {online ? 'Online' : 'Offline'}
                      </span>
                    </Badge>
                  )}
                </td>
                <td className="hidden px-4 py-3 2xl:table-cell">
                  {a.heartbeatMetrics?.cpuPercent != null ? (
                    <MetricBar label="" value={a.heartbeatMetrics.cpuPercent} compact />
                  ) : (
                    <span className="text-xs text-muted">—</span>
                  )}
                </td>
                <td className="hidden px-4 py-3 2xl:table-cell">
                  {a.heartbeatMetrics?.memoryPercent != null ? (
                    <MetricBar label="" value={a.heartbeatMetrics.memoryPercent} compact />
                  ) : (
                    <span className="text-xs text-muted">—</span>
                  )}
                </td>
                <td className="hidden px-4 py-3 2xl:table-cell">
                  {a.heartbeatMetrics?.diskReadPercent != null ? (
                    <MetricBar label="" value={a.heartbeatMetrics.diskReadPercent} compact color="primary" />
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
