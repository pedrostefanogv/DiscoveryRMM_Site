import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { TicketRunbookPanel } from './TicketRunbookPanel';
import { runbookApi } from '@/api/runbook';
import type { RunbookExecuteResultDto, TicketMacroRunbookStep } from '@/api/runbook';
import type { TicketMacroDto } from '@/api';

vi.mock('@/api/client', () => {
  const post = vi.fn();
  return { api: { post }, ApiError: class extends Error {} };
});

vi.mock('@/hooks/useRunbook', () => ({
  useExecuteRunbook: (ticketId: string) => ({
    mutateAsync: vi.fn(async ({ macroId }: { macroId: string }) => runbookApi.execute(ticketId, { macroId })),
    isPending: false,
  }),
}));

import { api } from '@/api/client';

const RESULT: RunbookExecuteResultDto = {
  ticketId: 'tk1',
  steps: [
    { order: 1, scriptId: 'sc1', ok: true, exitCode: 0, outputPreview: 'limpeza ok', commentId: 'cm1', durationMs: 320 },
    { order: 2, scriptId: 'sc2', ok: false, exitCode: 2, outputPreview: 'disk full', commentId: null, durationMs: 1500 },
  ],
};

function macroWith(steps: TicketMacroRunbookStep[] | null): TicketMacroDto {
  return {
    id: 'm1', clientId: null, departmentId: null, name: 'Runbook limpeza',
    description: null, content: '', isActive: true,
    createdBy: null, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    runbookSteps: steps,
  };
}

beforeEach(() => {
  (api.post as unknown as ReturnType<typeof vi.fn>).mockReset();
});

describe('Runbook (fluxo ticket)', () => {
  it('POST /api/v1/tickets/{id}/runbook/execute com macroId', async () => {
    (api.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(RESULT);
    const res = await runbookApi.execute('tk1', { macroId: 'm1' });
    expect(api.post).toHaveBeenCalledWith(
      '/api/v1/tickets/tk1/runbook/execute',
      { macroId: 'm1' },
    );
    expect(res.steps).toHaveLength(2);
    expect(res.steps[1].ok).toBe(false);
  });

  it('no painel: executar runbook mostra resultado por passo com link do comentário', async () => {
    (api.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(RESULT);
    render(<TicketRunbookPanel ticketId="tk1" macros={[macroWith([
      { order: 1, automationScriptId: 'sc1', argsJson: null, evidenceLabel: 'log' },
      { order: 2, automationScriptId: 'sc2' },
    ])]} />);
    // Seleciona e executa
    fireEvent.change(screen.getByLabelText('Selecionar runbook'), { target: { value: 'm1' } });
    fireEvent.click(screen.getByRole('button', { name: /Executar runbook/i }));
    await waitFor(() => expect(screen.getByTestId('runbook-step-1')).toBeTruthy());
    expect(screen.getByText('OK')).toBeTruthy();
    expect(screen.getByText('FALHA')).toBeTruthy();
    expect(screen.getByText('limpeza ok')).toBeTruthy();
    expect(screen.getByText('disk full')).toBeTruthy();
    // Link do comentário de evidência do passo 1
    expect(screen.getByText('ver comentário').getAttribute('href')).toBe('#comment-cm1');
  });

  it('painel some quando nenhuma macro tem runbookSteps', () => {
    render(<TicketRunbookPanel ticketId="tk1" macros={[macroWith(null)]} />);
    expect(screen.queryByTestId('runbook-panel')).not.toBeTruthy();
  });
});
