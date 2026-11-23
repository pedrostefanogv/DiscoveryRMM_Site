import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AgentCard } from './AgentCard';

/**
 * Regressão de layout do card da listagem.
 *
 * Histórico: para o badge de bateria não encostar no nome, foi aplicado um
 * respiro à direita no container de INFORMAÇÕES — que também engloba as barras de
 * CPU/RAM/HDD. Resultado: as barras paravam antes da borda do card (o operador
 * notou no painel). O respiro pertence ao CABEÇALHO (nome/hostname), que é o
 * único que fica na altura dos badges.
 */
function buildAgent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'a1',
    clientId: 'c1',
    siteId: 's1',
    hostname: 'NOTE-01',
    displayName: 'NOTE-01',
    operatingSystem: 'Windows 11 Pro',
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
    siteName: 'Matriz',
    heartbeatMetrics: { cpuPercent: 32, memoryPercent: 19, hasBattery: true, batteryPercent: 64, batteryOnAc: false },
    ...overrides,
  } as Parameters<typeof AgentCard>[0]['agent'];
}

afterEach(() => cleanup());

describe('AgentCard — largura do bloco de métricas', () => {
  it('com bateria: as barras de CPU/RAM/HDD NÃO ganham padding extra à direita', () => {
    const { container } = render(<AgentCard agent={buildAgent()} now={Date.now()} />);

    const cpuBar = container.querySelector('span.min-w-\\[2rem\\]');
    const metricsBlock = cpuBar?.closest('div.border-t');

    expect(metricsBlock).not.toBeNull();
    // O bloco de métricas (e o container de informações que o envolve) não pode
    // ter pr-16/pr-20: isso encolhia as barras.
    const infoBlock = metricsBlock?.parentElement;
    expect(infoBlock?.className ?? '').not.toMatch(/pr-(16|20)/);
    expect(metricsBlock?.className ?? '').not.toMatch(/pr-(16|20)/);
  });

  it('o cabeçalho é quem reserva espaço para a pilha de badges', () => {
    const { container } = render(<AgentCard agent={buildAgent()} now={Date.now()} />);

    const header = container.querySelector('div.flex.items-start.gap-3');
    expect(header?.className ?? '').toContain('pr-20');
  });

  it('sem bateria o cabeçalho mantém o respiro curto (pr-6)', () => {
    const { container } = render(
      <AgentCard agent={buildAgent({ heartbeatMetrics: { cpuPercent: 32 } })} now={Date.now()} />,
    );

    const header = container.querySelector('div.flex.items-start.gap-3');
    expect(header?.className ?? '').toContain('pr-6');
    expect(header?.className ?? '').not.toContain('pr-20');
  });
});
