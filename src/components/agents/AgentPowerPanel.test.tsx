import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BatteryInfo } from '@/api';
import { AgentPowerPanel } from './AgentPowerPanel';

// Sem heartbeat ao vivo no store e com "agora" fixo, o painel cai para o
// inventário — exatamente o caso dos agentes offline/em polling.
vi.mock('@/stores/heartbeatStore', () => ({
  useAgentHeartbeat: () => undefined,
  isHeartbeatTimestampFresh: () => false,
}));

vi.mock('@/hooks/useNowTick', () => ({
  useNowTick: () => Date.now(),
}));

function battery(overrides: Partial<BatteryInfo> = {}): BatteryInfo {
  return {
    manufacturer: 'SMP',
    model: 'L19M3PD6',
    serialNumber: '1234',
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

afterEach(() => cleanup());

/**
 * Painel de dispositivo/energia que vive DENTRO do card "Informações" do
 * detalhe do agente (antes era um card próprio, solto na página).
 */
describe('AgentPowerPanel', () => {
  it('mostra tipo de máquina, energia e saúde da bateria do inventário', () => {
    render(
      <AgentPowerPanel
        agentId="a1"
        isLaptop
        machineType="notebook"
        batteries={[battery()]}
        inventoryCollectedAt="2026-11-23T12:00:00Z"
      />,
    );

    expect(screen.getByText('Dispositivo e energia')).toBeTruthy();
    expect(screen.getByText('Notebook')).toBeTruthy();
    expect(screen.getByText('Na bateria')).toBeTruthy();
    // O percentual aparece no resumo e na bateria detalhada; a cor segue a faixa
    // (63% = success).
    const percentuais = screen.getAllByText('63%');
    expect(percentuais.length).toBeGreaterThanOrEqual(1);
    expect(percentuais[0].className).toContain('text-success');
    // Saúde = máxima/desenho (41000/45000 ≈ 91%).
    expect(screen.getByText('Saúde: 91%')).toBeTruthy();
    expect(screen.getByText('Ciclos: 212')).toBeTruthy();
    // Valor vindo do inventário é rotulado — o inventário roda a cada 24 h.
    expect(screen.getByText(/Inventário de/)).toBeTruthy();
  });

  it('mostra "Carregando" na tomada', () => {
    render(
      <AgentPowerPanel
        agentId="a1"
        isLaptop
        machineType="notebook"
        batteries={[battery({ onAc: true, charging: true })]}
      />,
    );

    expect(screen.getByText('Carregando')).toBeTruthy();
  });

  it('mostra Desktop sem detalhes de bateria', () => {
    render(<AgentPowerPanel agentId="a1" isLaptop={false} machineType="desktop" batteries={[]} />);

    expect(screen.getByText('Desktop')).toBeTruthy();
    expect(screen.queryByText(/Desenho:/)).toBeNull();
    expect(screen.queryByText(/Ciclos:/)).toBeNull();
  });

  it('não renderiza nada quando o agente não reportou nada (nem tipo, nem bateria)', () => {
    const { container } = render(
      <AgentPowerPanel agentId="a1" isLaptop={null} machineType={null} batteries={null} />,
    );

    expect(container.firstChild).toBeNull();
  });

  it('reconhece notebook pelo machineType mesmo sem o booleano isLaptop', () => {
    render(<AgentPowerPanel agentId="a1" isLaptop={null} machineType="notebook" batteries={[battery()]} />);

    expect(screen.getByText('Notebook')).toBeTruthy();
  });
});
