import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Decisão da triagem por IA exibida no resumo do chamado: estados sem decisão,
 * decisão aplicada (com candidatos) e ações sugerir/aplicar.
 */
const { decisionState, previewMutate, applyMutate } = vi.hoisted(() => ({
  decisionState: { data: undefined as unknown, isLoading: false, isError: false },
  previewMutate: vi.fn(),
  applyMutate: vi.fn(),
}));

vi.mock('@/hooks/useTicketAi', () => ({
  useTicketAssignmentDecision: () => decisionState,
  usePreviewTicketAssignment: () => ({ mutate: previewMutate, isPending: false }),
  useApplyTicketAssignment: () => ({ mutate: applyMutate, isPending: false }),
}));

import { TicketAiAssignmentCard } from './TicketAiAssignmentCard';

const decision = {
  id: 'd1',
  ticketId: 't1',
  departmentId: 'dep1',
  mode: 1,
  strategySource: 'ai',
  difficulty: 4,
  chosenUserId: 'u2',
  chosenUserName: 'Bruno Lima',
  confidence: 0.82,
  score: 0.71,
  rationale: 'Maior afinidade com o problema relatado.',
  model: 'gpt-4o-mini',
  tokensUsed: 120,
  applied: true,
  notAppliedReason: null,
  overriddenAt: null,
  overriddenByUserId: null,
  createdAt: '2026-01-01T00:00:00Z',
  maxOutputTokens: 1200,
  promptChars: 4310,
  candidates: [
    {
      userId: 'u2',
      userName: 'Bruno Lima',
      score: 0.71,
      skillScore: 0.9,
      affinityScore: 0.6,
      performanceScore: 0.7,
      loadScore: 0.8,
      csatScore: 0.9,
      slaScore: 1,
      overCapacity: false,
      openNow: 2,
      bestAffinityTicketTitle: 'VPN cai',
    },
    {
      userId: 'u3',
      userName: 'Carla Dias',
      score: 0.55,
      skillScore: 0.4,
      affinityScore: 0.2,
      performanceScore: 0.6,
      loadScore: 0.7,
      csatScore: 0.8,
      slaScore: 1,
      overCapacity: false,
      openNow: 4,
      bestAffinityTicketTitle: null,
    },
  ],
};

describe('TicketAiAssignmentCard', () => {
  beforeEach(() => {
    decisionState.data = undefined;
    decisionState.isLoading = false;
    decisionState.isError = false;
    previewMutate.mockClear();
    applyMutate.mockClear();
  });

  afterEach(() => cleanup());

  it('avisa quando não há decisão registrada', () => {
    render(<TicketAiAssignmentCard ticketId="t1" />);

    expect(screen.getByText('Triagem por IA')).toBeTruthy();
    expect(screen.getByText(/Nenhuma decisão registrada/)).toBeTruthy();
  });

  it('mostra a decisão aplicada e os candidatos avaliados', () => {
    decisionState.data = decision;
    render(<TicketAiAssignmentCard ticketId="t1" />);

    expect(screen.getByText('Escolha da IA')).toBeTruthy();
    expect(screen.getByText('Bruno Lima')).toBeTruthy();
    expect(screen.getByText('confiança 82%')).toBeTruthy();
    expect(screen.getByText('dificuldade 4/5')).toBeTruthy();
    expect(screen.getByText('aplicada')).toBeTruthy();
    expect(screen.getByText('orçamento 1200 tokens')).toBeTruthy();

    fireEvent.click(screen.getByText('Ver 2 candidato(s)'));
    expect(screen.getByText('Carla Dias')).toBeTruthy();
  });

  it('mostra o motivo quando a IA é bloqueada por limite de uso', () => {
    decisionState.data = { ...decision, strategySource: 'ai_budget_exceeded', applied: false };
    render(<TicketAiAssignmentCard ticketId="t1" />);

    expect(screen.getByText('Limite de uso de IA')).toBeTruthy();
    expect(screen.getByText('não aplicada')).toBeTruthy();
  });

  it('dispara a sugestão e a aplicação da triagem', () => {
    decisionState.data = decision;
    render(<TicketAiAssignmentCard ticketId="t1" />);

    fireEvent.click(screen.getByText('Sugerir com IA'));
    fireEvent.click(screen.getByText('Reavaliar e atribuir com IA'));

    expect(previewMutate).toHaveBeenCalledTimes(1);
    expect(previewMutate.mock.calls[0][0]).toBe('t1');
    expect(applyMutate).toHaveBeenCalledTimes(1);
    expect(applyMutate.mock.calls[0][0]).toBe('t1');
  });
});
