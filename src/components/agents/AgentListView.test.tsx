import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AgentListView } from './AgentListView';
import type { AgentCardAgent } from './AgentCard';

/**
 * Colunas de recursos da lista de agentes: as barras usam o espaço da célula e
 * mostram o percentual (antes o valor ficava só no title e a barra começava
 * depois de um rótulo vazio de 2rem).
 */
function buildAgent(overrides: Partial<AgentCardAgent> = {}): AgentCardAgent {
  return {
    id: 'a1',
    clientId: 'c1',
    siteId: 's1',
    hostname: 'HOST-01',
    displayName: 'HOST-01',
    operatingSystem: 'Windows 11',
    osVersion: '10.0',
    agentVersion: '1.0.0',
    commitHash: null,
    isOnline: true,
    lastSeen: '2026-01-01T00:00:00Z',
    lastSeenAt: '2026-01-01T00:00:00Z',
    lastIpAddress: '10.0.0.1',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    clientName: 'Acme',
    ...overrides,
  };
}

describe('AgentListView — colunas CPU/RAM/Leitura', () => {
  afterEach(() => cleanup());

  it('mostra o percentual de cada métrica (não só a barra)', () => {
    render(
      <AgentListView
        agents={[buildAgent({ heartbeatMetrics: { cpuPercent: 15, memoryPercent: 42, diskReadPercent: 7 } })]}
        now={Date.now()}
      />,
    );

    expect(screen.getByText('15%')).toBeTruthy();
    expect(screen.getByText('42%')).toBeTruthy();
    expect(screen.getByText('7%')).toBeTruthy();
  });

  it('arredonda valores fracionários', () => {
    render(
      <AgentListView
        agents={[buildAgent({ heartbeatMetrics: { cpuPercent: 12.6, memoryPercent: 99.4, diskReadPercent: 0.4 } })]}
        now={Date.now()}
      />,
    );

    expect(screen.getByText('13%')).toBeTruthy();
    expect(screen.getByText('99%')).toBeTruthy();
    expect(screen.getByText('0%')).toBeTruthy();
  });

  it('sem métricas (agente offline) mostra travessão nas colunas', () => {
    render(<AgentListView agents={[buildAgent({ isOnline: false, heartbeatMetrics: undefined })]} now={Date.now()} />);
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(3);
  });

  it('não reserva rótulo vazio antes das barras', () => {
    const { container } = render(
      <AgentListView
        agents={[buildAgent({ heartbeatMetrics: { cpuPercent: 15, memoryPercent: 42, diskReadPercent: 7 } })]}
        now={Date.now()}
      />,
    );
    const reservados = Array.from(container.querySelectorAll('span')).filter((el) =>
      el.className.includes('min-w-[2rem]'),
    );
    expect(reservados).toHaveLength(0);
  });
});

/**
 * Selo de notebook e chip de energia na visão em tabela.
 *
 * Mesma regra do card: selo só com `isLaptop === true`; energia só quando o
 * heartbeat reporta presença de bateria (ausência de dado não vira "sem
 * bateria" nem "0%").
 */
describe('AgentListView — notebook e energia', () => {
  afterEach(() => cleanup());

  it('distingue notebook pelo ÍCONE, sem selo textual', () => {
    render(
      <AgentListView
        agents={[buildAgent({ isLaptop: true, machineType: 'notebook' })]}
        now={Date.now()}
      />,
    );

    // O selo textual saiu (o ícone já distingue); o tipo fica no title.
    expect(screen.queryByText('Notebook')).toBeNull();
    expect(screen.getByTitle('Dispositivo: Notebook')).toBeTruthy();
  });

  it('não mostra title de tipo quando não reportado (null)', () => {
    render(<AgentListView agents={[buildAgent({ isLaptop: null, machineType: null })]} now={Date.now()} />);

    expect(screen.queryByText('Notebook')).toBeNull();
    expect(screen.queryByTitle(/^Dispositivo:/)).toBeNull();
  });

  it('mostra percentual de bateria do heartbeat ao vivo', () => {
    render(
      <AgentListView
        agents={[
          buildAgent({
            isLaptop: true,
            heartbeatMetrics: { hasBattery: true, batteryPercent: 63, batteryOnAc: false, batteryCharging: false },
          }),
        ]}
        now={Date.now()}
      />,
    );

    expect(screen.getByText('63%')).toBeTruthy();
  });

  it('desktop (hasBattery=false) não mostra chip de energia', () => {
    render(
      <AgentListView
        agents={[buildAgent({ isLaptop: false, heartbeatMetrics: { hasBattery: false, batteryOnAc: true } })]}
        now={Date.now()}
      />,
    );

    expect(screen.queryByText('63%')).toBeNull();
  });
});
