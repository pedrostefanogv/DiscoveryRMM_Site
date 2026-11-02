import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Modal de limpeza de regras órfãs: sempre roda o DRY-RUN primeiro e só aplica
 * com confirmação explícita. A contagem/orfãos vêm da API.
 */

const mocks = vi.hoisted(() => ({
  cleanupMutate: vi.fn(),
}));

vi.mock('@/hooks/useAppStore', () => ({
  useCleanupOrphanApprovalRules: () => ({
    mutateAsync: mocks.cleanupMutate,
    isPending: false,
    variables: { dryRun: true },
  }),
}));

import { OrphanCleanupModal } from './OrphanCleanupModal';

beforeEach(() => {
  mocks.cleanupMutate.mockReset();
  mocks.cleanupMutate.mockImplementation(async ({ dryRun }) =>
    dryRun
      ? {
          orphans: [
            { ruleId: 'r1', installationType: 2, packageId: 'foxit_editor', scopeType: 0, action: 0, updatedAt: '2026-10-13T10:00:00Z' },
            { ruleId: 'r2', installationType: 2, packageId: 'app_apagado', scopeType: 1, clientId: 'c1', action: 0, updatedAt: '2026-10-13T10:00:00Z' },
          ],
        }
      : { orphans: [], removed: 2 },
  );
});

afterEach(() => cleanup());

describe('OrphanCleanupModal', () => {
  it('roda o dry-run ao abrir e lista as regras órfãs', async () => {
    render(<OrphanCleanupModal open onClose={() => undefined} />);

    await waitFor(() => expect(mocks.cleanupMutate).toHaveBeenCalledWith({ dryRun: true }));
    expect(await screen.findByText('2 regra(s) órfã(s)')).toBeTruthy();
    expect(screen.getByText(/foxit_editor — regra r1/)).toBeTruthy();
    expect(screen.getByText(/app_apagado — regra r2 · escopo Cliente/)).toBeTruthy();
  });

  it('mostra "nenhuma regra órfã" quando o dry-run volta vazio', async () => {
    mocks.cleanupMutate.mockResolvedValue({ orphans: [] });
    render(<OrphanCleanupModal open onClose={() => undefined} />);

    expect(await screen.findByText('Nenhuma regra órfã encontrada.')).toBeTruthy();
  });

  it('aplica a limpeza e informa quantas regras foram removidas', async () => {
    const cleaned = vi.fn();
    render(<OrphanCleanupModal open onClose={() => undefined} onCleaned={cleaned} />);

    await screen.findByText('2 regra(s) órfã(s)');
    fireEvent.click(screen.getByRole('button', { name: 'Limpar regras órfãs' }));

    await waitFor(() => expect(mocks.cleanupMutate).toHaveBeenCalledWith({ dryRun: false }));
    await waitFor(() => expect(cleaned).toHaveBeenCalledWith(2));
  });
});
