import { useMemo } from 'react';
import type { AgentHeartbeatMetrics, BatteryInfo } from '@/api';
import { BatteryGauge, Icon } from '@/components/ui';
import { useNowTick } from '@/hooks/useNowTick';
import { isHeartbeatTimestampFresh, useAgentHeartbeat } from '@/stores/heartbeatStore';
import { batteryPowerLabel, machineTypeLabel, resolveBatteryView } from '@/utils/agentPower';

interface AgentPowerPanelProps {
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
 * Painel de dispositivo/energia exibido DENTRO do card "Informações" do detalhe
 * do agente (não é um card próprio — o card isolado anterior ficou solto na
 * página e desperdiçava a metade vazia do card de informações).
 *
 * Isola a assinatura do heartbeat ao vivo (mesmo padrão do
 * LiveAgentHeartbeatCard) para que ticks de CPU/RAM/disco não re-renderizem a
 * página inteira de detalhe.
 *
 * Precedência explícita e rotulada: heartbeat AO VIVO → inventário ("última
 * coleta") → nada. O inventário roda a cada 24 h; mostrar aquele valor como se
 * fosse atual diria "na tomada" para um notebook já desplugado.
 */
export function AgentPowerPanel({
  agentId,
  fallbackMetrics,
  batteries,
  isLaptop,
  machineType,
  inventoryCollectedAt,
}: AgentPowerPanelProps) {
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
  const isLaptopDevice = isLaptop === true || machineType?.trim().toLowerCase() === 'notebook';

  // Sem nada a dizer (agente antigo, sem inventário e sem bateria) o painel não
  // aparece: melhor vazio do que afirmando "desconhecido" em toda a frota.
  if (!machineLabel && !resolved) return null;

  const isInventoryOnly = resolved?.source === 'inventory';
  const inventoryHint = isInventoryOnly && inventoryCollectedAt
    ? 'Inventário de ' + formatCollectedAt(inventoryCollectedAt)
    : null;

  return (
    <div className="space-y-4 rounded-xl border border-border bg-surface-light/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Dispositivo e energia</p>
        {inventoryHint && <span className="text-[10px] text-muted">{inventoryHint}</span>}
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-xs text-muted">Tipo de máquina</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm font-medium text-foreground">
            {isLaptopDevice && <Icon name="laptop_mac" className="h-4 w-4 text-accent" />}
            {machineLabel ?? '—'}
          </p>
        </div>

        <div>
          <p className="text-xs text-muted">Energia</p>
          <div className="mt-0.5">
            {resolved ? (
              <BatteryGauge
                size="md"
                percent={resolved.view.percent}
                onAc={resolved.view.onAc}
                charging={resolved.view.charging}
                label={batteryPowerLabel(resolved.view.onAc, resolved.view.charging)}
              />
            ) : (
              <span className="text-sm text-muted">—</span>
            )}
          </div>
        </div>
      </div>

      {batteries && batteries.length > 0 && (
        <div className="space-y-2 border-t border-border pt-3">
          {batteries.map((battery, index) => {
            const health =
              battery.maxCapacityMAh > 0 && battery.designedCapacityMAh > 0
                ? Math.round((battery.maxCapacityMAh / battery.designedCapacityMAh) * 100)
                : null;
            const title = [battery.manufacturer, battery.model].filter(Boolean).join(' ') || 'Bateria ' + (index + 1);
            const stateLabel = batteryPowerLabel(battery.onAc ?? null, battery.charging);
            return (
              <div key={title + '-' + index} className="rounded-lg bg-surface px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-foreground">{title}</p>
                  <BatteryGauge
                    percent={battery.percentRemaining}
                    onAc={battery.onAc ?? null}
                    charging={battery.charging}
                  />
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
                  {/* Estado NORMALIZADO (onAc/charging do SO) em vez do texto
                      cru do WMI: as duas fontes podem divergir e o onAc é a que
                      decide "na tomada"; o texto cru fica só como diagnóstico
                      quando não há leitura normalizada. */}
                  <span>
                    Estado:{' '}
                    {stateLabel === '—' && battery.state ? battery.state : stateLabel}
                  </span>
                  {battery.designedCapacityMAh > 0 && (
                    <span>Desenho: {battery.designedCapacityMAh} mAh</span>
                  )}
                  {battery.maxCapacityMAh > 0 && <span>Máxima: {battery.maxCapacityMAh} mAh</span>}
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
    </div>
  );
}

/** Data compacta (pt-BR) da coleta de inventário, sem depender do util de página. */
function formatCollectedAt(value: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return value;
  return parsed.toLocaleDateString('pt-BR');
}
