import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Ticket } from '@/api';

const { rateMock } = vi.hoisted(() => ({ rateMock: vi.fn() }));
vi.mock('@/hooks/useTickets', () => ({
  useRateTicket: () => ({ mutate: rateMock, isPending: false }),
}));

import { TicketRatingCard } from './TicketRatingCard';

const ticket = (over: Partial<Ticket> = {}): Ticket => ({
  id: 't1',
  clientId: 'c1',
  siteId: null,
  agentId: null,
  departmentId: null,
  workflowProfileId: null,
  title: 'Chamado',
  description: 'd',
  priority: 'Medium',
  category: null,
  assignedToUserId: null,
  workflowStateId: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  closedAt: null,
  ...over,
}) as Ticket;

describe('TicketRatingCard', () => {
  afterEach(() => cleanup());

  it('não aparece enquanto o chamado está aberto', () => {
    const { container } = render(<TicketRatingCard ticket={ticket()} />);
    expect(container.textContent).toBe('');
  });

  it('encerrado sem avaliação mostra o formulário com o helper', () => {
    render(<TicketRatingCard ticket={ticket({ closedAt: '2026-02-01T10:00:00Z' })} />);

    expect(screen.getByText('Avaliação (CSAT)')).toBeTruthy();
    expect(screen.getByText(/quem abriu o chamado/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Salvar avaliação/ })).toBeTruthy();
  });

  it('encerrado e avaliado mostra o resultado (somente leitura)', () => {
    render(
      <TicketRatingCard
        ticket={ticket({
          closedAt: '2026-02-01T10:00:00Z',
          rating: 4,
          ratingFeedback: 'Atendimento rápido',
          ratedAt: '2026-02-02T12:00:00Z',
          ratedBy: 'ana',
        })}
      />,
    );

    expect(screen.getByText('Atendimento rápido')).toBeTruthy();
    expect(screen.getByText(/Avaliado em/)).toBeTruthy();
    expect(screen.getByText(/por ana/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Salvar avaliação/ })).toBeNull();
  });
});
