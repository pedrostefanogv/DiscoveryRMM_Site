import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BatteryInfo } from '@/api';
import { AgentPowerCard } from './AgentPowerCard';

// Sem heartbeat ao vivo no store e com "agora" fixo, o card cai para o
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

describe('AgentPowerCard', () => {
  it('mostra tipo de máquina, energia e saúde da bateria do inventário', () => {
    render(
      <AgentPowerCard
        agentId="a1"
        isLaptop
        machineType="notebook"
        batteries={[battery()]}
        inventoryCollectedAt="2026-11-23T12:00:00Z"
      />,
    );

    expect(screen.getByText('Energia e bateria')).toBeTruthy();
    expect(screen.getByText('Notebook')).toBeTruthy();
    expect(screen.getByText('Na bateria')).toBeTruthy();
    expect(screen.getByText('63%')).toBeTruthy();
    // Saúde = máxima/desenho (41000/45000 ≈ 91%).
    expect(screen.getByText('Saúde: 91%')).toBeTruthy();
    expect(screen.getByText('Ciclos: 212')).toBeTruthy();
    // Valor vindo do inventário é rotulado — o inventário roda a cada 24 h.
    expect(screen.getByText('última coleta')).toBeTruthy();
  });

  it('mostra "Na tomada" quando o inventário reporta AC', () => {
    render(<AgentPowerCard agentId="a1" isLaptop machineType="notebook" batteries={[battery({ onAc: true, charging: true })]} />);

    expect(screen.getByText('Carregando')).toBeTruthy();
  });

  it('mostra Desktop sem detalhes de bateria', () => {
    render(<AgentPowerCard agentId="a1" isLaptop={false} machineType="desktop" batteries={[]} />);

    expect(screen.getByText('Desktop')).toBeTruthy();
    // O rótulo "Bateria" do resumo continua (com "—"), mas nenhum detalhe de
    // bateria é renderizado: desktop não tem bateria para listar.
    expect(screen.getByText('Bateria')).toBeTruthy();
    expect(screen.queryByText('—', { selector: 'p.tabular-nums' })).toBeTruthy();
    expect(screen.queryByText(/Desenho:/)).toBeNull();
    expect(screen.queryByText(/Ciclos:/)).toBeNull();
  });

  it('não renderiza nada quando o agente não reportou nada (nem tipo, nem bateria)', () => {
    const { container } = render(<AgentPowerCard agentId="a1" isLaptop={null} machineType={null} batteries={null} />);

    expect(container.firstChild).toBeNull();
  });
});
