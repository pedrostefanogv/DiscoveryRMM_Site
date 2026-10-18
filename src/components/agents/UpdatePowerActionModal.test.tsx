import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import UpdatePowerActionModal from './UpdatePowerActionModal';

const snapshotState = {
  approvedCount: 0,
  pendingCount: 2,
  deniedCount: 0,
};

vi.mock('@/hooks/useAgentWindowsUpdates', () => ({
  useAgentWindowsUpdateSnapshot: () => ({
    data: {
      agentId: 'a1',
      pendingCount: snapshotState.pendingCount,
      installedCount: 0,
      deniedCount: snapshotState.deniedCount,
      approvedCount: snapshotState.approvedCount,
      scanStatus: 'ok',
      scanError: null,
      scanDurationMs: null,
      lastCollectedAt: null,
      pendingReboot: false,
      pendingRebootReasons: [],
      rebootCheckedAt: null,
    },
    isLoading: false,
  }),
  useInstallApprovedWindowsUpdates: () => ({ isPending: false, mutateAsync: vi.fn() }),
}));

describe('UpdatePowerActionModal — atualizar e reiniciar/desligar', () => {
  afterEach(() => cleanup());

  it('bloqueia a confirmação quando não há atualizações aprovadas', () => {
    snapshotState.approvedCount = 0;
    render(
      <UpdatePowerActionModal open agentId="a1" agentName="HOST-01" action="restart" onClose={() => {}} />,
    );

    expect(screen.getByText(/Nenhuma atualização aprovada/)).toBeTruthy();
    const confirm = screen.getByRole('button', { name: /Atualizar e reiniciar/i });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
  });

  it('habilita a confirmação quando há atualizações aprovadas', () => {
    snapshotState.approvedCount = 2;
    render(
      <UpdatePowerActionModal open agentId="a1" agentName="HOST-01" action="shutdown" onClose={() => {}} />,
    );

    const confirm = screen.getByRole('button', { name: /Atualizar e desligar/i });
    expect((confirm as HTMLButtonElement).disabled).toBe(false);
  });
});
