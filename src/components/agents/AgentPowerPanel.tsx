import { useMemo } from 'react';
import type { AgentHeartbeatMetrics, BatteryInfo } from '@/api';
import { BatteryGauge, Icon } from '@/components/ui';
import { useNowTick } from '@/hooks/useNowTick';
import { isHeartbeatTimestampFresh, useAgentHeartbeat } from '@/stores/heartbeatStore';
import {
  batteryPowerLabel,
  isAgentLaptop,
  machineTypeLabel,
  resolveBatteryView,
} from '@/utils/agentPower';

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
 * Coluna de dispositivo/energia do card "Informações" do detalhe do agente.
 *
 * Não é um card: fica na mesma superfície do card de informações, separada
 * apenas por uma divisão lateral, e usa a MESMA tipografia dos dados
 * cadastrais (dt muted / dd foreground) para não parecer um bloco estranho.
 *
 * Isola a assinatura do heartbeat ao vivo (mesmo padrão do
 * LiveAgentHeartbeatCard) para que ticks de CPU/RAM/disco não re-renderizem a
 * página inteira de detalhe.
 *
 * Precedência explícita: heartbeat AO VIVO → inventário (rotulado) → nada. O
 * inventário roda a cada 24 h; mostrar aquele valor como se fosse atual diria
 * "na tomada" para um notebook já desplugado.
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
  // Mesma regra do card/listagem: booleano explícito OU o vocabulário canônico
  // (notebook/tablet) — senão o ícone sumia para um tablet.
  const isLaptopDevice = isAgentLaptop({ isLaptop, machineType });

  // Sem nada a dizer (agente antigo, sem inventário e sem bateria) a coluna não
  // aparece: melhor vazio do que afirmando "desconhecido" em toda a frota.
  if (!machineLabel && !resolved) return null;

  const isInventoryOnly = resolved?.source === 'inventory';
  const inventoryHint =
    isInventoryOnly && inventoryCollectedAt
      ? 'Inventário de ' + formatCollectedAt(inventoryCollectedAt)
      : null;

  return (
    <div className="border-t border-border pt-4 sm:border-t-0 sm:border-l sm:border-border sm:pl-6 sm:pt-0">
      <dl className="space-y-3 text-sm">
        <div>
          <dt className="text-muted">Tipo de máquina</dt>
          <dd className="mt-0.5 flex items-center gap-1.5 text-foreground">
            {isLaptopDevice && <Icon name="laptop_mac" className="h-4 w-4 shrink-0 text-accent" />}
            {machineLabel ?? '—'}
          </dd>
        </div>

        <div>
          <dt className="text-muted">Energia</dt>
          <dd className="mt-0.5 flex flex-wrap items-center gap-2 text-foreground">
            {resolved ? (
              <BatteryGauge
                size="md"
                percent={resolved.view.percent}
                onAc={resolved.view.onAc}
                charging={resolved.view.charging}
                state={resolved.view.state}
              />
            ) : (
              <span>—</span>
            )}
            {inventoryHint && <span className="text-xs text-muted">{inventoryHint}</span>}
          </dd>
        </div>
      </dl>

      {batteries && batteries.length > 0 && (
        <div className="mt-3 space-y-3 border-t border-border pt-3">
          {batteries.map((battery, index) => {
            const health =
              battery.maxCapacityMAh > 0 && battery.designedCapacityMAh > 0
                ? Math.round((battery.maxCapacityMAh / battery.designedCapacityMAh) * 100)
                : null;
            const title =
              [battery.manufacturer, battery.model].filter(Boolean).join(' ') || 'Bateria ' + (index + 1);
            const stateLabel = batteryPowerLabel(battery.onAc ?? null, battery.charging, battery.state);
            // O rótulo do indicador já mostra o estado; o texto cru do SO só
            // aparece quando ele é a ÚNICA fonte (rótulo desconhecido).
            const showRawState = stateLabel === '—' && !!battery.state;

            return (
              <div key={title + '-' + index}>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate text-foreground">{title}</span>
                  <BatteryGauge
                    percent={battery.percentRemaining}
                    onAc={battery.onAc ?? null}
                    charging={battery.charging}
                    state={battery.state}
                  />
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
                  {showRawState && <span>Estado: {battery.state}</span>}
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

/** Data curta (pt-BR) da coleta de inventário, sem depender de util de página. */
function formatCollectedAt(value: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return value;
  return parsed.toLocaleDateString('pt-BR');
}
