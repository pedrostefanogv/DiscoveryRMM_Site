import { useMemo } from 'react';
import type { AgentHeartbeatMetrics, BatteryInfo } from '@/api';
import { Card, CardHeader, Icon } from '@/components/ui';
import { useNowTick } from '@/hooks/useNowTick';
import { isHeartbeatTimestampFresh, useAgentHeartbeat } from '@/stores/heartbeatStore';
import {
  batteryPowerLabel,
  formatBatteryPercent,
  machineTypeLabel,
  resolveBatteryView,
} from '@/utils/agentPower';
import { formatDate } from '@/pages/agents/agentDetailUtils';

interface AgentPowerCardProps {
  agentId: string;
  /**
   * Métricas do heartbeat no polling HTTP — fallback quando não há evento ao
   * vivo no NATS. Só é usada se ainda estiver dentro da janela de frescor.
   */
  fallbackMetrics?: AgentHeartbeatMetrics | null;
  /** Baterias do inventário (24 h): saúde/desenho e retrato do estado. */
  batteries?: BatteryInfo[] | null;
  isLaptop?: boolean | null;
  machineType?: string | null;
  /** Data da coleta do inventário, para rotular valor que NÃO é ao vivo. */
  inventoryCollectedAt?: string | null;
}

/**
 * Card de energia do detalhe do agente: tipo de máquina, bateria (%) e estado
 * da tomada, com a saúde da(s) bateria(s) quando o inventário traz os dados.
 *
 * Isola a assinatura do heartbeat ao vivo (mesmo padrão do
 * `LiveAgentHeartbeatCard`) para que ticks de CPU/RAM/disco não re-renderizem a
 * página inteira de detalhe.
 *
 * Precedência explícita e rotulada: heartbeat AO VIVO → inventário ("coletado
 * em ...") → nada. O inventário roda a cada 24 h; mostrar aquele valor como se
 * fosse atual diria "na tomada" para um notebook já desplugado.
 */
export function AgentPowerCard({
  agentId,
  fallbackMetrics,
  batteries,
  isLaptop,
  machineType,
  inventoryCollectedAt,
}: AgentPowerCardProps) {
  const liveHeartbeat = useAgentHeartbeat(agentId);
  const now = useNowTick(15_000);

  const liveMetrics = useMemo<AgentHeartbeatMetrics | undefined>(() => {
    const hasFreshLive =
      liveHeartbeat &&
      isHeartbeatTimestampFresh(
        liveHeartbeat.timestampUtc,
        now,
        undefined,
        liveHeartbeat.receivedAtUtc,
      );

    if (hasFreshLive) {
      return {
        hasBattery: liveHeartbeat.hasBattery,
        batteryPercent: liveHeartbeat.batteryPercent,
        batteryOnAc: liveHeartbeat.batteryOnAc,
        batteryCharging: liveHeartbeat.batteryCharging,
      };
    }

    if (
      fallbackMetrics &&
      isHeartbeatTimestampFresh(
        fallbackMetrics.timestampUtc,
        now,
        undefined,
        fallbackMetrics.receivedAtUtc,
      )
    ) {
      return fallbackMetrics;
    }

    return undefined;
  }, [liveHeartbeat, fallbackMetrics, now]);

  const resolved = resolveBatteryView(liveMetrics, batteries);
  const machineLabel = machineTypeLabel({ machineType, isLaptop });

  // Sem nada a dizer (agente antigo, sem inventário e sem bateria) o card não
  // aparece: melhor vazio do que afirmando "desconhecido" em toda a frota.
  if (!machineLabel && !resolved) return null;

  const percentage = resolved ? formatBatteryPercent(resolved.view.percent) : '—';
  const powerLabel = resolved
    ? batteryPowerLabel(resolved.view.onAc, resolved.view.charging)
    : '—';
  const isInventoryOnly = resolved?.source === 'inventory';

  return (
    <Card>
      <CardHeader
        title="Energia e bateria"
        subtitle={isInventoryOnly && inventoryCollectedAt
          ? `Inventário de ${formatDate(inventoryCollectedAt)}`
          : 'Estado reportado pelo agente'}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <p className="text-xs text-muted">Tipo de máquina</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm font-medium text-foreground">
            {isLaptop === true && <Icon name="laptop_mac" className="h-4 w-4 text-accent" />}
            {machineLabel ?? '—'}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted">Energia</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm font-medium text-foreground">
            {resolved && (
              <Icon
                name={resolved.view.charging ? 'bolt' : 'power_settings_new'}
                className={`h-4 w-4 ${resolved.view.onAc === false ? 'text-warning' : 'text-muted'}`}
              />
            )}
            {powerLabel}
            {isInventoryOnly && <span className="text-[10px] text-muted">última coleta</span>}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted">Bateria</p>
          <p className="mt-0.5 text-sm font-medium tabular-nums text-foreground">{percentage}</p>
        </div>
      </div>

      {batteries && batteries.length > 0 && (
        <div className="mt-4 space-y-2 border-t border-border pt-4">
          {batteries.map((battery, index) => {
            const health =
              battery.maxCapacityMAh > 0 && battery.designedCapacityMAh > 0
                ? Math.round((battery.maxCapacityMAh / battery.designedCapacityMAh) * 100)
                : null;
            const title = [battery.manufacturer, battery.model].filter(Boolean).join(' ') || `Bateria ${index + 1}`;
            return (
              <div key={`${title}-${index}`} className="rounded-lg bg-surface-light px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-foreground">{title}</p>
                  <p className="text-xs text-muted">
                    {formatBatteryPercent(battery.percentRemaining)}
                    {battery.chemistry ? ` · ${battery.chemistry}` : ''}
                  </p>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
                  {/* Estado NORMALIZADO (onAc/charging do SO) em vez do texto
                      cru do WMI: as duas fontes podem divergir e o onAc é a
                      que decide "na tomada"; o texto cru fica só como
                      diagnóstico quando não há leitura normalizada. */}
                  <span>
                    Estado:{' '}
                    {batteryPowerLabel(battery.onAc ?? null, battery.charging) === '—' && battery.state
                      ? battery.state
                      : batteryPowerLabel(battery.onAc ?? null, battery.charging)}
                  </span>
                  {battery.designedCapacityMAh > 0 && (
                    <span>Desenho: {battery.designedCapacityMAh} mAh</span>
                  )}
                  {battery.maxCapacityMAh > 0 && (
                    <span>Máxima: {battery.maxCapacityMAh} mAh</span>
                  )}
                  {health != null && <span>Saúde: {health}%</span>}
                  {battery.health && <span>Condição: {battery.health}</span>}
                  {battery.cycleCount > 0 && <span>Ciclos: {battery.cycleCount}</span>}
                  {battery.serialNumber && <span>Série: {battery.serialNumber}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
