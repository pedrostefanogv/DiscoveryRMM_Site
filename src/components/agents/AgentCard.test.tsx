import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AgentCard } from './AgentCard';

/**
 * O card do agente exibe o usuário logado no Windows reportado pelo agent,
 * ao lado do Cliente/Site, e lida com o caso sem usuário.
 */
function buildAgent(
  overrides: Partial<{ loggedUser: string | null; loggedUserSince: string | null }> = {},
) {
  return {
    id: 'a1',
    clientId: 'c1',
    siteId: 's1',
    hostname: 'PC-01',
    displayName: 'PC-01',
    operatingSystem: 'Windows 11 Pro',
    osVersion: '10.0 (25H2)',
    agentVersion: '1.2.1',
    commitHash: null,
    isOnline: true,
    lastSeen: '2026-01-01T00:00:00Z',
    lastSeenAt: '2026-01-01T00:00:00Z',
    lastIpAddress: '10.0.0.1',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    clientName: 'Acme',
    siteName: 'Matriz',
    ...overrides,
  } as Parameters<typeof AgentCard>[0]['agent'];
}

afterEach(() => cleanup());

describe('AgentCard — usuário logado', () => {
  it('exibe o usuário logado reportado', () => {
    render(<AgentCard agent={buildAgent({ loggedUser: String.raw`CORP\pedro` })} now={Date.now()} />);
    expect(screen.getByText(String.raw`CORP\pedro`)).toBeTruthy();
  });

  it('exibe travessão quando não há usuário logado', () => {
    render(<AgentCard agent={buildAgent({ loggedUser: null })} now={Date.now()} />);
    expect(screen.getByText('\u2014')).toBeTruthy();
  });

  it('mostra há quanto tempo a sessão está aberta', () => {
    render(
      <AgentCard
        agent={buildAgent({
          loggedUser: String.raw`CORP\pedro`,
          loggedUserSince: new Date().toISOString(),
        })}
        now={Date.now()}
      />,
    );

    expect(screen.getByText('agora mesmo')).toBeTruthy();
  });

  it('não mostra tempo de sessão quando o agent não reporta o início', () => {
    render(
      <AgentCard
        agent={buildAgent({ loggedUser: String.raw`CORP\pedro`, loggedUserSince: null })}
        now={Date.now()}
      />,
    );

    expect(screen.queryByText('agora mesmo')).toBeNull();
  });
});
