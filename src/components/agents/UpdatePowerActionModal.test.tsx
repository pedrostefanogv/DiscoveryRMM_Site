import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import UpdatePowerActionModal from './UpdatePowerActionModal';

const snapshotState = {
  hasData: true,
  approvedCount: 0,
  pendingCount: 2,
  deniedCount: 0,
  pendingReboot: false,
  pendingRebootReasons: [] as string[],
};

const installMutateAsync = vi.fn();
const restartMutateAsync = vi.fn();
const shutdownMutateAsync = vi.fn();

vi.mock('@/hooks/useAgentWindowsUpdates', () => ({
  useAgentWindowsUpdateSnapshot: () => ({
    data: snapshotState.hasData
      ? {
          agentId: 'a1',
          pendingCount: snapshotState.pendingCount,
          installedCount: 0,
          deniedCount: snapshotState.deniedCount,
          approvedCount: snapshotState.approvedCount,
          scanStatus: 'ok',
          scanError: null,
          scanDurationMs: null,
          lastCollectedAt: null,
          pendingReboot: snapshotState.pendingReboot,
          pendingRebootReasons: snapshotState.pendingRebootReasons,
          rebootCheckedAt: null,
        }
      : undefined,
    isLoading: false,
  }),
  useInstallApprovedWindowsUpdates: () => ({ isPending: false, mutateAsync: installMutateAsync }),
}));

vi.mock('@/hooks/useAgents', () => ({
  useRestartAgent: () => ({ isPending: false, mutateAsync: restartMutateAsync }),
  useShutdownAgent: () => ({ isPending: false, mutateAsync: shutdownMutateAsync }),
}));

vi.mock('@/pages/agents/agentDetailUtils', () => ({
  awaitAgentCommandById: vi.fn().mockResolvedValue(null),
  notifyAgentCommandOutcome: vi.fn(),
}));

describe('UpdatePowerActionModal — atualizar e reiniciar/desligar', () => {
  beforeEach(() => {
    installMutateAsync.mockReset().mockResolvedValue({ message: 'ok' });
    restartMutateAsync.mockReset().mockResolvedValue({ commandId: 'cmd-r' });
    shutdownMutateAsync.mockReset().mockResolvedValue({ commandId: 'cmd-s' });
    snapshotState.hasData = true;
    snapshotState.approvedCount = 0;
    snapshotState.pendingReboot = false;
    snapshotState.pendingRebootReasons = [];
  });

  afterEach(() => cleanup());

  it('bloqueia a confirmação quando não há atualizações aprovadas nem reboot pendente', () => {
    render(
      <UpdatePowerActionModal open agentId="a1" agentName="HOST-01" action="restart" onClose={() => {}} />,
    );

    expect(screen.getByText(/Nenhuma atualização aprovada ou pendente de reinício/)).toBeTruthy();
    const confirm = screen.getByRole('button', { name: /Atualizar e reiniciar/i });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
  });

  it('habilita a confirmação e instala aprovadas quando approvedCount > 0', async () => {
    snapshotState.approvedCount = 2;
    render(
      <UpdatePowerActionModal open agentId="a1" agentName="HOST-01" action="shutdown" onClose={() => {}} />,
    );

    const confirm = screen.getByRole('button', { name: /Atualizar e desligar/i }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(false);

    fireEvent.click(confirm);
    await waitFor(() => {
      expect(installMutateAsync).toHaveBeenCalledWith({
        agentId: 'a1',
        postAction: 'shutdown',
        confirm: true,
      });
    });
  });

  it('habilita e dispara reinício para concluir atualização quando há pendingReboot de Windows Update', async () => {
    snapshotState.approvedCount = 0;
    snapshotState.pendingReboot = true;
    snapshotState.pendingRebootReasons = ['windows_update'];

    render(
      <UpdatePowerActionModal open agentId="a1" agentName="HOST-01" action="restart" onClose={() => {}} />,
    );

    expect(screen.getByText(/O Windows já possui atualizações preparadas/)).toBeTruthy();
    expect(screen.queryByText(/aprovada\(s\) será\(ão\) instalada\(s\)/)).toBeNull();
    const confirm = screen.getByRole('button', { name: /Atualizar e reiniciar/i }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(false);

    fireEvent.click(confirm);
    await waitFor(() => {
      expect(restartMutateAsync).toHaveBeenCalledWith(expect.objectContaining({ id: 'a1' }));
    });
    expect(installMutateAsync).not.toHaveBeenCalled();
  });

  it('usa fallback hasPendingWindowsUpdate quando snapshot ainda está indisponível', async () => {
    snapshotState.hasData = false;

    render(
      <UpdatePowerActionModal
        open
        agentId="a1"
        agentName="HOST-01"
        action="shutdown"
        hasPendingWindowsUpdate
        onClose={() => {}}
      />,
    );

    const confirm = screen.getByRole('button', { name: /Atualizar e desligar/i }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(false);

    fireEvent.click(confirm);
    await waitFor(() => {
      expect(shutdownMutateAsync).toHaveBeenCalledWith(expect.objectContaining({ id: 'a1' }));
    });
  });
});
