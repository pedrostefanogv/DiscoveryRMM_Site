import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Página de regras de auto-ticket.
 *
 * Estes são os PRIMEIROS testes desta página (antes não havia nenhum). O foco é
 * o "drift de contrato" que existia: a página usava nomes de campo inventados
 * (monitoringEventCode, ticketTitleTemplate) que não existem na API, o que fazia
 * a tela renderizar vazio contra o backend real.
 */
const { listMock, statsMock, simulateMock, seedMock, enableMock, disableMock, deleteMock } =
  vi.hoisted(() => ({
    listMock: vi.fn(),
    statsMock: vi.fn(),
    simulateMock: vi.fn(),
    seedMock: vi.fn(),
    enableMock: vi.fn(),
    disableMock: vi.fn(),
    deleteMock: vi.fn(),
  }));

vi.mock('@/api', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/api');
  return {
    ...actual,
    autoTicketRulesApi: {
      list: listMock,
      getStats: statsMock,
      simulate: simulateMock,
      dryRun: vi.fn(),
      seedDefaults: seedMock,
      enable: enableMock,
      disable: disableMock,
      delete: deleteMock,
      create: vi.fn(),
      update: vi.fn(),
      getPolicy: vi.fn(),
      saveServerPolicy: vi.fn(),
      saveClientPolicy: vi.fn(),
      saveSitePolicy: vi.fn(),
    },
  };
});

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

import AutoTicketRulesPage from './AutoTicketRulesPage';

/** Regra com os campos REAIS do backend (AutoTicketRuleDto). */
const REAL_RULE = {
  id: 'r1',
  name: 'Disco cheio abre chamado',
  isEnabled: true,
  scopeLevel: 'Client',
  scopeId: 'c1',
  alertCodeFilter: 'sensor:disk_space',
  sourceFilter: null,
  targetDepartmentId: null,
  targetWorkflowProfileId: null,
  targetCategory: 'Capacity',
  targetPriority: 'High',
  dedupWindowMinutes: 60,
  cooldownMinutes: 0,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AutoTicketRulesPage />
    </QueryClientProvider>,
  );
}

describe('AutoTicketRulesPage', () => {
  beforeEach(() => {
    listMock.mockReset().mockResolvedValue([REAL_RULE]);
    statsMock.mockReset();
    simulateMock.mockReset();
    seedMock.mockReset();
    enableMock.mockReset();
    disableMock.mockReset();
    deleteMock.mockReset();
  });

  afterEach(() => cleanup());

  it('renderiza usando os campos REAIS do contrato (alertCodeFilter, scopeLevel)', async () => {
    renderPage();

    expect(await screen.findByText('Disco cheio abre chamado')).toBeTruthy();
    // O filtro real aparece; o nome inventado antigo não existe mais.
    expect(screen.getByText('sensor:disk_space')).toBeTruthy();
    expect(screen.getByText('Client')).toBeTruthy();
  });

  it('mostra a prioridade e a janela de deduplicação reais', async () => {
    renderPage();

    await screen.findByText('Disco cheio abre chamado');
    expect(screen.getByText('Prioridade: High')).toBeTruthy();
    expect(screen.getByText('Dedup: 60 min')).toBeTruthy();
  });

  it('não exibe mais o aviso de "recurso em elaboração"', async () => {
    renderPage();

    await screen.findByText('Disco cheio abre chamado');
    expect(screen.queryByText(/Recurso em elaboração/)).toBeNull();
  });

  it('oferece o formulário de simulação (dry-run)', async () => {
    renderPage();

    await screen.findByText('Disco cheio abre chamado');
    expect(screen.getByText('Simular (dry-run)')).toBeTruthy();
  });

  it('desabilita o botão de simular enquanto faltam entradas', async () => {
    renderPage();

    await screen.findByText('Disco cheio abre chamado');
    const button = screen.getByRole('button', { name: 'Simular' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it('exibe o resultado da simulação quando o backend responde', async () => {
    simulateMock.mockResolvedValue({
      decision: 0,
      wouldCreateTicket: false,
      ruleId: 'r1',
      ruleName: 'Disco cheio abre chamado',
      reason: 'AutoTicket shadow mode is active.',
      dedupKey: 'abc123',
    });

    renderPage();
    await screen.findByText('Disco cheio abre chamado');

    fireEvent.change(screen.getByLabelText('Cliente (GUID)'), {
      target: { value: '11111111-1111-1111-1111-111111111111' },
    });
    fireEvent.change(screen.getByLabelText('Código do alerta'), {
      target: { value: 'sensor:disk_space' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Simular' }));

    await waitFor(() => {
      expect(screen.getByText('NÃO criaria um chamado')).toBeTruthy();
    });
    expect(screen.getByText('AutoTicket shadow mode is active.')).toBeTruthy();
  });

  it('mostra o estado vazio explicando que sem regra nada é aberto', async () => {
    listMock.mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText('Nenhuma regra configurada')).toBeTruthy();
    expect(screen.getByText(/nenhum chamado automático é aberto/)).toBeTruthy();
  });
});
