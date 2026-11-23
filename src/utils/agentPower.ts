import type { AgentHeartbeatMetrics, BatteryInfo } from '@/api';

/**
 * Formato físico da máquina, no vocabulário fechado compartilhado com o agente
 * (Go) e com a API (.NET).
 */
export type MachineType = 'notebook' | 'desktop' | 'tablet' | 'server' | 'unknown';

/** Campos mínimos para decidir o selo de notebook (subconjunto de Agent). */
export interface AgentMachineLike {
  isLaptop?: boolean | null;
  machineType?: string | null;
}

/**
 * Decide se o agente é notebook.
 *
 * Só `true` explícito marca. `null`/`undefined` é "NÃO REPORTADO" (agente
 * antigo, VM sem WMI ou coleta inconclusiva) e não pode virar "desktop" nem
 * esconder o selo por engano — é o mesmo princípio do isServer (M272).
 */
export function isAgentLaptop(agent: AgentMachineLike): boolean {
  return agent.isLaptop === true;
}

const MACHINE_TYPE_LABELS: Record<string, string> = {
  notebook: 'Notebook',
  tablet: 'Tablet',
  desktop: 'Desktop',
  server: 'Servidor',
};

/**
 * Rótulo de exibição do tipo de máquina. Devolve null quando não foi reportado
 * — a UI mostra "—", nunca um rótulo inventado.
 */
export function machineTypeLabel(agent: AgentMachineLike): string | null {
  const raw = agent.machineType?.trim().toLowerCase();
  if (!raw) return null;
  return MACHINE_TYPE_LABELS[raw] ?? null;
}

/** Rótulo do selo: prefere o tipo específico e cai para "Notebook". */
export function laptopBadgeLabel(agent: AgentMachineLike): string {
  const label = machineTypeLabel(agent);
  // "Desktop"/"Servidor" no selo seria contraditório (o selo só aparece com
  // isLaptop === true); aceita apenas a família móvel.
  if (label === 'Tablet') return 'Tablet';
  return 'Notebook';
}

/**
 * Estado de energia derivado de uma leitura (heartbeat ou inventário).
 * `onAc`/`percent` null = desconhecido — a UI mostra "—" em vez de afirmar.
 */
export interface BatteryView {
  hasBattery: boolean;
  percent: number | null;
  onAc: boolean | null;
  charging: boolean;
}

/** Texto do estado de energia. Desconhecido rende "—". */
export function batteryPowerLabel(onAc: boolean | null, charging = false): string {
  if (onAc === false) return charging ? 'Carregando' : 'Na bateria';
  if (onAc === true) return charging ? 'Carregando' : 'Na tomada';
  return charging ? 'Carregando' : '—';
}

/** Percentual formatado; null/fora da faixa rende "—". */
export function formatBatteryPercent(percent: number | null | undefined): string {
  if (percent == null || !Number.isFinite(percent) || percent < 0 || percent > 100) return '—';
  return `${Math.round(percent)}%`;
}

/**
 * Converte as métricas do heartbeat ao vivo em estado de bateria.
 *
 * Devolve null quando o agente não reportou presença de bateria: melhor não
 * renderizar nada do que afirmar "sem bateria" a partir de ausência de dado.
 */
export function batteryFromMetrics(
  metrics: AgentHeartbeatMetrics | null | undefined,
): BatteryView | null {
  if (!metrics || metrics.hasBattery !== true) return null;

  return {
    hasBattery: true,
    percent:
      metrics.batteryPercent != null && metrics.batteryPercent >= 0 && metrics.batteryPercent <= 100
        ? metrics.batteryPercent
        : null,
    onAc: metrics.batteryOnAc ?? null,
    charging: metrics.batteryCharging === true,
  };
}

/**
 * Converte a lista de baterias do inventário (24 h) em um estado consolidado.
 *
 * Agregação para multi-bateria (ex.: ThinkPad com interna + removível): usa o
 * MENOR percentual (pior caso, é o que importa em campo) e considera "na
 * tomada" quando qualquer bateria reporta AC.
 */
export function aggregateBatteries(
  batteries: BatteryInfo[] | null | undefined,
): BatteryView | null {
  if (!batteries || batteries.length === 0) return null;

  const percents = batteries
    .map((battery) => battery.percentRemaining)
    .filter((value) => Number.isFinite(value) && value >= 0 && value <= 100);

  const onAcValues = batteries
    .map((battery) => battery.onAc)
    .filter((value): value is boolean => typeof value === 'boolean');

  return {
    hasBattery: true,
    percent: percents.length > 0 ? Math.min(...percents) : null,
    onAc: onAcValues.length > 0 ? onAcValues.some(Boolean) : null,
    charging: batteries.some((battery) => battery.charging === true),
  };
}

/**
 * Estado de energia para exibição, com PRECEDÊNCIA explícita:
 * heartbeat ao vivo (recente, já filtrado por quem chama) → inventário → nada.
 *
 * A origem importa: o inventário roda a cada 24 h, então o painel precisa saber
 * quando o valor é só um retrato antigo (a UI rotula "coletado em").
 */
export function resolveBatteryView(
  liveMetrics: AgentHeartbeatMetrics | null | undefined,
  inventoryBatteries: BatteryInfo[] | null | undefined,
): { view: BatteryView; source: 'live' | 'inventory' } | null {
  const live = batteryFromMetrics(liveMetrics);
  if (live) return { view: live, source: 'live' };

  const fromInventory = aggregateBatteries(inventoryBatteries);
  if (fromInventory) return { view: fromInventory, source: 'inventory' };

  return null;
}
