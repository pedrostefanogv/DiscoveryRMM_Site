import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AgentListView } from './AgentListView';
import type { AgentCardAgent } from './AgentCard';

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
    lastSeen: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    lastIpAddress: '10.0.0.1',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    clientName: 'Acme',
    ...overrides,
  };
}

describe('AgentListView — badge de reinício pendente', () => {
  afterEach(() => cleanup());

  it('mostra o badge quando o agente tem reinício pendente', () => {
    render(
      <AgentListView
        agents={[buildAgent({ pendingReboot: true, pendingRebootReasons: '["windows_update","cbs"]' })]}
        now={Date.now()}
      />,
    );

    const badge = screen.getByText('Reinício pendente');
    expect(badge).toBeTruthy();
    expect(badge.closest('[title]')?.getAttribute('title')).toContain('Windows Update');
  });

  it('não mostra o badge quando não há reinício pendente', () => {
    render(<AgentListView agents={[buildAgent()]} now={Date.now()} />);
    expect(screen.queryByText('Reinício pendente')).toBeNull();
  });
});
