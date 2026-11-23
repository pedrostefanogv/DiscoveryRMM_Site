import { describe, expect, it } from 'vitest';
import type { AgentHeartbeatMetrics, BatteryInfo } from '@/api';
import {
  aggregateBatteries,
  batteryFromMetrics,
  batteryPowerLabel,
  formatBatteryPercent,
  isAgentLaptop,
  laptopBadgeLabel,
  machineTypeLabel,
  resolveBatteryView,
} from './agentPower';

function battery(overrides: Partial<BatteryInfo> = {}): BatteryInfo {
  return {
    manufacturer: 'SMP',
    model: 'L19M3PD6',
    serialNumber: null,
    chemistry: 'LiP',
    state: 'Discharging',
    present: true,
    onAc: false,
    charging: false,
    charged: false,
    percentRemaining: 63,
    designedCapacityMAh: 45000,
    maxCapacityMAh: 41000,
    currentCapacityMAh: 25800,
    health: null,
    cycleCount: 212,
    minutesUntilEmpty: 180,
    minutesToCharge: 0,
    ...overrides,
  };
}

describe('isAgentLaptop — tri-estado', () => {
  it('marca apenas true explícito', () => {
    expect(isAgentLaptop({ isLaptop: true })).toBe(true);
  });

  it('false é resposta positiva (desktop) e não marca', () => {
    expect(isAgentLaptop({ isLaptop: false })).toBe(false);
  });

  it('null/undefined = não reportado e não marca', () => {
    // Agente antigo/VM: mostrar selo seria mentir; tratar como desktop também.
    expect(isAgentLaptop({ isLaptop: null })).toBe(false);
    expect(isAgentLaptop({})).toBe(false);
  });
});

describe('rótulos de tipo de máquina', () => {
  it('traduz o vocabulário fechado', () => {
    expect(machineTypeLabel({ machineType: 'notebook' })).toBe('Notebook');
    expect(machineTypeLabel({ machineType: 'desktop' })).toBe('Desktop');
    expect(machineTypeLabel({ machineType: 'tablet' })).toBe('Tablet');
    expect(machineTypeLabel({ machineType: 'server' })).toBe('Servidor');
  });

  it('valor fora do vocabulário ou ausente rende null (UI mostra —)', () => {
    expect(machineTypeLabel({ machineType: 'unknown' })).toBeNull();
    expect(machineTypeLabel({ machineType: null })).toBeNull();
    expect(machineTypeLabel({})).toBeNull();
  });

  it('selo usa Notebook e distingue Tablet', () => {
    expect(laptopBadgeLabel({ machineType: 'notebook' })).toBe('Notebook');
    expect(laptopBadgeLabel({ machineType: 'tablet' })).toBe('Tablet');
    // Sem machineType específico, o selo continua "Notebook".
    expect(laptopBadgeLabel({ isLaptop: true })).toBe('Notebook');
  });
});

describe('batteryPowerLabel', () => {
  it('distingue tomada, bateria, carregando e desconhecido', () => {
    expect(batteryPowerLabel(true)).toBe('Na tomada');
    expect(batteryPowerLabel(false)).toBe('Na bateria');
    expect(batteryPowerLabel(false, true)).toBe('Carregando');
    expect(batteryPowerLabel(true, true)).toBe('Carregando');
    expect(batteryPowerLabel(null)).toBe('—');
  });
});

describe('formatBatteryPercent', () => {
  it('formata valores válidos', () => {
    expect(formatBatteryPercent(63)).toBe('63%');
    expect(formatBatteryPercent(0)).toBe('0%');
  });

  it('não inventa número para desconhecido/fora da faixa', () => {
    expect(formatBatteryPercent(null)).toBe('—');
    expect(formatBatteryPercent(undefined)).toBe('—');
    expect(formatBatteryPercent(255)).toBe('—');
    expect(formatBatteryPercent(-1)).toBe('—');
  });
});

describe('batteryFromMetrics', () => {
  it('exige hasBattery === true: ausência de dado não é "sem bateria"', () => {
    expect(batteryFromMetrics(undefined)).toBeNull();
    expect(batteryFromMetrics({})).toBeNull();
    expect(batteryFromMetrics({ hasBattery: false })).toBeNull();
  });

  it('deriva percentual/estado quando o agente reporta bateria', () => {
    const metrics: AgentHeartbeatMetrics = {
      hasBattery: true,
      batteryPercent: 63,
      batteryOnAc: false,
      batteryCharging: false,
    };

    expect(batteryFromMetrics(metrics)).toEqual({
      hasBattery: true,
      percent: 63,
      onAc: false,
      charging: false,
    });
  });

  it('percentual fora da faixa vira null (não "255%")', () => {
    expect(batteryFromMetrics({ hasBattery: true, batteryPercent: 255 })?.percent).toBeNull();
  });
});

describe('aggregateBatteries — multi-bateria', () => {
  it('usa o pior percentual e "na tomada" se qualquer uma reportar AC', () => {
    const view = aggregateBatteries([
      battery({ percentRemaining: 85, onAc: true, charging: true }),
      battery({ percentRemaining: 12, onAc: false }),
    ]);

    expect(view?.percent).toBe(12);
    expect(view?.onAc).toBe(true);
    expect(view?.charging).toBe(true);
  });

  it('sem bateria ou lista vazia rende null', () => {
    expect(aggregateBatteries([])).toBeNull();
    expect(aggregateBatteries(null)).toBeNull();
  });
});

describe('resolveBatteryView — precedência ao vivo × inventário', () => {
  it('heartbeat ao vivo vence o inventário de 24 h', () => {
    const resolved = resolveBatteryView(
      { hasBattery: true, batteryPercent: 40, batteryOnAc: false },
      [battery({ percentRemaining: 99, onAc: true })],
    );

    expect(resolved?.source).toBe('live');
    expect(resolved?.view.percent).toBe(40);
    expect(resolved?.view.onAc).toBe(false);
  });

  it('cai para o inventário quando não há heartbeat utilizável', () => {
    const resolved = resolveBatteryView(undefined, [battery({ percentRemaining: 55, onAc: true })]);

    expect(resolved?.source).toBe('inventory');
    expect(resolved?.view.percent).toBe(55);
    expect(resolved?.view.onAc).toBe(true);
  });

  it('sem heartbeat e sem inventário rende null', () => {
    expect(resolveBatteryView(undefined, null)).toBeNull();
  });
});
