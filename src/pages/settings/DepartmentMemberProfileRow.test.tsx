import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DepartmentMemberProfileDto } from '@/api';

/**
 * Regressão: a API serializa com JsonIgnoreCondition.WhenWritingNull, então campos
 * anuláveis chegam omitidos (valor undefined) e não como null. O render não pode
 * assumir null — foi exatamente isso que derrubou /tickets/departments/:id com
 * "can't access property toFixed, p.csatAverage is undefined".
 */
const { updateProfileMock } = vi.hoisted(() => ({ updateProfileMock: vi.fn() }));

vi.mock('@/hooks/useDepartments', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useDepartments')>();
  return {
    ...actual,
    useUpdateDepartmentMemberProfile: () => ({ mutate: updateProfileMock, isPending: false }),
  };
});

import { MemberProfileRow } from './DepartmentDetailPage';

/** Payload como a API envia: sem csatAverage, sem tempos médios e sem maxOpenTickets. */
function memberWithOmittedNulls(): DepartmentMemberProfileDto {
  return {
    departmentId: 'd1',
    userId: 'u1',
    userName: 'Ana Souza',
    isActive: true,
    createdAt: '2026-01-01T00:00:00Z',
    skillTags: [],
    skillLevel: 3,
    weight: 1,
    acceptsAiAssignment: true,
    metrics: {
      userId: 'u1',
      windowDays: 90,
      assignedTotal: 4,
      resolvedTotal: 3,
      openNow: 1,
      slaBreachRate: 0.25,
      reopenRate: 0,
      csatRatedCount: 0,
      topCategories: [],
      topTags: [],
    },
  } as unknown as DepartmentMemberProfileDto;
}

describe('MemberProfileRow', () => {
  beforeEach(() => updateProfileMock.mockClear());
  afterEach(() => cleanup());

  it('não quebra e mostra "—" quando csatAverage e maxOpenTickets são omitidos', () => {
    render(<MemberProfileRow member={memberWithOmittedNulls()} />);

    expect(screen.queryByText(/undefined/)).toBeNull();
    expect(screen.getByText(/CSAT:/).textContent).toContain('—');

    const maxOpen = screen.getByLabelText('Teto de abertos') as HTMLInputElement;
    expect(maxOpen.value).toBe('');
  });

  it('formata o CSAT quando presente', () => {
    const member = memberWithOmittedNulls();
    member.metrics!.csatAverage = 4.25;

    render(<MemberProfileRow member={member} />);

    expect(screen.getByText(/CSAT:/).textContent).toContain('4.3');
  });

  it('bloqueia a edição de membro herdado (gerenciado no global)', () => {
    const member = {
      ...memberWithOmittedNulls(),
      origin: 'inherited:11111111-1111-1111-1111-111111111111',
    };

    render(<MemberProfileRow member={member} />);

    expect(screen.getByText('herdado do global')).toBeTruthy();
    expect(screen.getByText(/Perfil gerenciado no departamento global/)).toBeTruthy();

    const tags = screen.getByLabelText('Competências (vírgula)') as HTMLInputElement;
    const level = screen.getByLabelText('Nível (1-5)') as HTMLInputElement;
    const maxOpen = screen.getByLabelText('Teto de abertos') as HTMLInputElement;
    const weight = screen.getByLabelText('Peso (0,1-3)') as HTMLInputElement;
    const accepts = screen.getByLabelText(
      'Aceita ser escolhido automaticamente pela IA',
    ) as HTMLInputElement;
    const save = screen.getByRole('button', { name: 'Salvar perfil' }) as HTMLButtonElement;

    for (const control of [tags, level, maxOpen, weight, accepts]) {
      expect(control.disabled).toBe(true);
    }
    expect(save.disabled).toBe(true);
  });

  it('mantém a edição liberada para membro próprio', () => {
    render(<MemberProfileRow member={memberWithOmittedNulls()} />);

    const tags = screen.getByLabelText('Competências (vírgula)') as HTMLInputElement;
    const save = screen.getByRole('button', { name: 'Salvar perfil' }) as HTMLButtonElement;

    expect(tags.disabled).toBe(false);
    expect(save.disabled).toBe(false);
    expect(screen.queryByText('herdado do global')).toBeNull();
  });
});
