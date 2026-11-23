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
 * Coluna de dispositivo/energia do card "Informações" do detalhe.
 *
 * Ela NÃO é um card: não tem título/uppercase nem fundo próprio — usa a mesma
 * tipografia dos dados cadastrais (dl/dt/dd) e só uma divisão lateral.
 */
describe('AgentPowerPanel', () => {
  it('usa a tipografia do card (dt/dd) e mostra energia + saúde da bateria', () => {
    render(
      <AgentPowerPanel
        agentId="a1"
        isLaptop
        machineType="notebook"
        batteries={[battery()]}
        inventoryCollectedAt="2026-11-23T12:00:00Z"
      />,
    );

    expect(screen.getByText('Tipo de máquina')).toBeTruthy();
    expect(screen.getByText('Energia')).toBeTruthy();
    expect(screen.getByText('Notebook')).toBeTruthy();
    // Rótulo aparece no resumo e na bateria detalhada.
    expect(screen.getAllByText('Na bateria').length).toBeGreaterThanOrEqual(1);

    const percentuais = screen.getAllByText('63%');
    expect(percentuais.length).toBeGreaterThanOrEqual(1);
    // A cor segue a faixa (63% = success).
    expect(percentuais[0].className).toContain('text-success');

    expect(screen.getByText('Saúde: 91%')).toBeTruthy();
    expect(screen.getByText('Ciclos: 212')).toBeTruthy();
    // Valor vindo do inventário é rotulado — o inventário roda a cada 24 h.
    expect(screen.getByText(/Inventário de/)).toBeTruthy();
  });

  /**
   * Regressão do teste de campo: o inventário antigo não trazia o booleano de
   * tomada, só o texto cru do WMI (On AC). O painel mostrava "—" para um
   * notebook que estava na tomada.
   */
  it('diz Na tomada quando o booleano não veio, mas o texto do SO diz On AC', () => {
    render(
      <AgentPowerPanel
        agentId="a1"
        isLaptop
        machineType="notebook"
        batteries={[battery({ onAc: null, state: 'On AC' })]}
      />,
    );

    expect(screen.getAllByText('Na tomada').length).toBeGreaterThanOrEqual(1);
    // O texto cru só aparece quando é a ÚNICA fonte — aqui o rótulo já resolveu.
    expect(screen.queryByText('Estado: On AC')).toBeNull();
  });

  it('mostra Carregando na tomada', () => {
    render(
      <AgentPowerPanel
        agentId="a1"
        isLaptop
        machineType="notebook"
        batteries={[battery({ onAc: true, charging: true })]}
      />,
    );

    expect(screen.getAllByText('Carregando').length).toBeGreaterThanOrEqual(1);
  });

  it('mostra Desktop sem detalhes de bateria (e energia desconhecida)', () => {
    render(<AgentPowerPanel agentId="a1" isLaptop={false} machineType="desktop" batteries={[]} />);

    expect(screen.getByText('Desktop')).toBeTruthy();
    expect(screen.getByText('Energia')).toBeTruthy();
    expect(screen.getByText('—')).toBeTruthy();
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
