import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Ticket, TicketAnswerItem } from '@/api';

const { answersMock } = vi.hoisted(() => ({ answersMock: vi.fn() }));

vi.mock('@/hooks/useTicketAnswers', () => ({
  useTicketAnswers: (ticketId: string, enabled?: boolean) => answersMock(ticketId, enabled),
}));

vi.mock('@/theme/ThemeContext', () => ({
  useTheme: () => ({ mode: 'light' }),
}));

import { TicketOpeningSection } from './TicketDetail';

const ticket = (over: Partial<Ticket> = {}): Ticket => ({
  id: 't1',
  clientId: 'c1',
  siteId: null,
  agentId: null,
  departmentId: null,
  workflowProfileId: null,
  title: 'Computador',
  description: 'Solicito cotação para compra de 3 computadores',
  priority: 'Medium',
  category: null,
  assignedToUserId: null,
  workflowStateId: null,
  createdAt: '2026-09-27T02:46:00Z',
  updatedAt: '2026-09-27T02:46:00Z',
  closedAt: null,
  ...over,
}) as Ticket;

const answer = (over: Partial<TicketAnswerItem> = {}): TicketAnswerItem => ({
  questionKey: 'nome',
  questionLabel: 'Nome',
  valueText: 'Ana',
  valueJson: '"Ana"',
  createdAt: '2026-09-27T02:46:00Z',
  ...over,
});

/** Retorno no formato que o componente consome do useQuery. */
const answersResult = (items: TicketAnswerItem[] = [], over: Record<string, unknown> = {}) => ({
  data: items,
  isLoading: false,
  isError: false,
  ...over,
});

describe('TicketOpeningSection', () => {
  afterEach(() => {
    cleanup();
    answersMock.mockReset();
  });

  it('não renderiza em chamado comum, mesmo com snapshot markdown legado', () => {
    answersMock.mockReturnValue(answersResult([]));

    const { container } = render(
      <TicketOpeningSection
        ticket={ticket({
          templateId: null,
          templateName: null,
          // Dados legados: aberturas antigas sem template gravaram o snapshot.
          submissionSnapshotMarkdown:
            '### Formulário do chamado\n\n- **Título enviado:** Computador\n\n#### Campos do departamento\n\n| Campo | Valor |\n| --- | --- |\n| Tipo | Cotação |',
        })}
      />,
    );

    // Regressão: chamado sem template segue com os dados normais; nada do bloco
    // de abertura (título, badge ou registro markdown) pode aparecer.
    expect(container.textContent).toBe('');
    expect(screen.queryByText('Abertura do chamado')).toBeNull();
    expect(screen.queryByText(/Abertura normal/)).toBeNull();
    expect(screen.queryByText(/Registro original da abertura/)).toBeNull();
    expect(screen.queryByText(/Formulário do chamado/)).toBeNull();
  });

  it('não busca respostas quando o chamado não tem template', () => {
    answersMock.mockReturnValue(answersResult([]));

    render(<TicketOpeningSection ticket={ticket({ templateId: null, templateName: null })} />);

    expect(answersMock).toHaveBeenCalledWith('t1', false);
  });

  it('continua oculto sem template mesmo se houver respostas órfãs', () => {
    // Defesa contra regressão: só `templateName` habilita a seção. Respostas
    // remanescentes (ex.: template desvinculado) não podem reabrir o bloco.
    answersMock.mockReturnValue(answersResult([answer()]));

    const { container } = render(
      <TicketOpeningSection ticket={ticket({ templateId: null, templateName: null })} />,
    );

    expect(container.textContent).toBe('');
  });

  it('mostra badge do template e as respostas do questionário', () => {
    answersMock.mockReturnValue(
      answersResult([answer({ questionKey: 'nome', questionLabel: 'Nome', valueText: 'Ana' })]),
    );

    render(
      <TicketOpeningSection
        ticket={ticket({
          templateId: 'tpl-1',
          templateName: 'Novo usuário',
          submissionSnapshotMarkdown: '### Formulário do chamado\n\n- **Template:** Novo usuário',
        })}
      />,
    );

    expect(screen.getByText('Abertura do chamado')).toBeTruthy();
    // "Novo usuário" também aparece dentro do snapshot markdown; aqui interessa
    // o badge do template no topo da seção.
    expect(screen.getAllByText('Novo usuário').length).toBeGreaterThan(0);
    expect(screen.getByText('Nome')).toBeTruthy();
    expect(screen.getByText('Ana')).toBeTruthy();
    expect(screen.getByText('Registro original da abertura (markdown)')).toBeTruthy();
    expect(answersMock).toHaveBeenCalledWith('t1', true);
  });

  it('avisa quando o template foi removido do catálogo', () => {
    answersMock.mockReturnValue(answersResult([answer()]));

    render(
      <TicketOpeningSection ticket={ticket({ templateId: null, templateName: 'Cotação' })} />,
    );

    expect(screen.getByText('Cotação')).toBeTruthy();
    expect(screen.getByText('Template removido do catálogo')).toBeTruthy();
  });

  it('mantém o markdown aberto quando o modelo não tem respostas', () => {
    answersMock.mockReturnValue(answersResult([]));

    const { container } = render(
      <TicketOpeningSection
        ticket={ticket({
          templateId: 'tpl-1',
          templateName: 'Cotação',
          submissionSnapshotMarkdown: '### Formulário do chamado',
        })}
      />,
    );

    expect(screen.getByText(/Nenhuma resposta registrada/)).toBeTruthy();
    expect(container.querySelector('details')?.hasAttribute('open')).toBe(true);
  });
});
