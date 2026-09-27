import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Card de sugestões do aprendizado híbrido: estados vazio, competências e pesos,
 * e as ações de aplicar/descartar.
 */
const { learningState, runMock, applySkillMock, discardSkillMock, applyWeightMock, discardWeightMock } = vi.hoisted(() => ({
  learningState: { data: undefined as unknown, isLoading: false, isError: false },
  runMock: vi.fn(),
  applySkillMock: vi.fn(),
  discardSkillMock: vi.fn(),
  applyWeightMock: vi.fn(),
  discardWeightMock: vi.fn(),
}));

vi.mock('@/hooks/useDepartments', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useDepartments')>();
  return {
    ...actual,
    useDepartmentLearningSuggestions: () => learningState,
    useRunLearningCycle: () => ({ mutate: runMock, isPending: false }),
    useApplySkillSuggestion: () => ({ mutate: applySkillMock, isPending: false }),
    useDiscardSkillSuggestion: () => ({ mutate: discardSkillMock, isPending: false }),
    useApplyWeightSuggestion: () => ({ mutate: applyWeightMock, isPending: false }),
    useDiscardWeightSuggestion: () => ({ mutate: discardWeightMock, isPending: false }),
  };
});

import { DepartmentLearningCard } from './DepartmentDetailPage';

const weights = { skill: 0.25, affinity: 0.25, performance: 0.2, load: 0.15, csat: 0.1, slaQuality: 0.05 };

describe('DepartmentLearningCard', () => {
  beforeEach(() => {
    learningState.data = undefined;
    learningState.isLoading = false;
    learningState.isError = false;
    runMock.mockClear();
    applySkillMock.mockClear();
    discardSkillMock.mockClear();
    applyWeightMock.mockClear();
    discardWeightMock.mockClear();
  });

  afterEach(() => cleanup());

  it('avisa quando não há sugestões pendentes', () => {
    render(<DepartmentLearningCard departmentId="d1" />);

    expect(screen.getByText('Sugestões da IA (aprendizado)')).toBeTruthy();
    expect(screen.getByText(/Nenhuma sugestão pendente/)).toBeTruthy();
  });

  it('mostra competências sugeridas e aplica/descarta', () => {
    learningState.data = {
      skills: [
        {
          id: 's1',
          departmentId: 'd1',
          userId: 'u1',
          userName: 'Ana Souza',
          windowDays: 90,
          suggestedTags: ['rede', 'vpn'],
          appliedTags: [],
          evidenceJson: '{"resolvedTickets":47,"tags":[{"tag":"rede","count":47}]}',
          status: 'pending',
          autoApplied: false,
          createdAt: '2026-01-01T00:00:00Z',
          decidedAt: null,
          decidedByUserId: null,
        },
      ],
      weights: [],
    };

    render(<DepartmentLearningCard departmentId="d1" />);

    expect(screen.getByText('Ana Souza')).toBeTruthy();
    expect(screen.getByText(/rede, vpn/)).toBeTruthy();
    expect(screen.getByText(/chamados resolvidos: 47/)).toBeTruthy();

    fireEvent.click(screen.getByText('Aplicar'));
    fireEvent.click(screen.getByText('Descartar'));
    expect(applySkillMock.mock.calls[0][0]).toBe('s1');
    expect(discardSkillMock.mock.calls[0][0]).toBe('s1');
  });

  it('mostra pesos sugeridos e roda o ciclo', () => {
    learningState.data = {
      skills: [],
      weights: [
        {
          id: 'w1',
          departmentId: 'd1',
          cycleDays: 7,
          windowStart: '2026-01-01T00:00:00Z',
          windowEnd: '2026-01-08T00:00:00Z',
          currentWeights: weights,
          suggestedWeights: { ...weights, skill: 0.35, csat: 0.05 },
          evidenceJson: '{"csat":{"strength":0.3}}',
          status: 'pending',
          autoApplied: false,
          createdAt: '2026-01-08T00:00:00Z',
          decidedAt: null,
          decidedByUserId: null,
        },
      ],
    };

    render(<DepartmentLearningCard departmentId="d1" />);

    expect(screen.getByText(/Pesos sugeridos/)).toBeTruthy();
    expect(screen.getByText(/competência 0.35/)).toBeTruthy();

    fireEvent.click(screen.getByText('Aplicar pesos'));
    expect(applyWeightMock.mock.calls[0][0]).toBe('w1');

    fireEvent.click(screen.getByText('Rodar ciclo agora'));
    expect(runMock).toHaveBeenCalledTimes(1);
  });
});
