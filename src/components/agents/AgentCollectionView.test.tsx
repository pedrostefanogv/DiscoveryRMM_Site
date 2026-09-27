import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentCollectionView } from './AgentCollectionView';
import type { AgentCardAgent } from './AgentCard';

/**
 * Coleção de agentes usada nas abas de cliente/site: alternância card/lista e
 * clique com botão direito (menu de contexto).
 */

function buildAgent(id: string, hostname: string): AgentCardAgent {
  return {
    id,
    clientId: 'c1',
    siteId: 's1',
    hostname,
    displayName: hostname,
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
  };
}

describe('AgentCollectionView', () => {
  afterEach(() => cleanup());

  it('alterna entre cards e lista', () => {
    render(
      <AgentCollectionView
        agents={[buildAgent('a1', 'HOST-01'), buildAgent('a2', 'HOST-02')]}
        now={Date.now()}
        emptyMessage="Nenhum agente"
        onOpen={vi.fn()}
      />,
    );

    // Padrão: cards (sem tabela).
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByText('HOST-01')).toBeTruthy();

    fireEvent.click(screen.getByTitle('Visualização em lista'));
    expect(screen.getByRole('table')).toBeTruthy();
    expect(screen.getByText('Sistema Operacional')).toBeTruthy();

    fireEvent.click(screen.getByTitle('Visualização em cards'));
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('dispara o menu de contexto no botão direito (card e lista)', () => {
    const onContextMenu = vi.fn();
    render(
      <AgentCollectionView
        agents={[buildAgent('a1', 'HOST-01')]}
        now={Date.now()}
        emptyMessage="Nenhum agente"
        onOpen={vi.fn()}
        onContextMenu={onContextMenu}
        filterable={false}
      />,
    );

    fireEvent.contextMenu(screen.getByText('HOST-01'));
    expect(onContextMenu).toHaveBeenCalledTimes(1);
    expect(onContextMenu.mock.calls[0][1].id).toBe('a1');

    fireEvent.click(screen.getByTitle('Visualização em lista'));
    fireEvent.contextMenu(screen.getByText('HOST-01'));
    expect(onContextMenu).toHaveBeenCalledTimes(2);
    expect(onContextMenu.mock.calls[1][1].id).toBe('a1');
  });
});
