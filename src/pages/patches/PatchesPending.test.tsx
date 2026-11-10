import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import PatchesPending, { isPendingAgentOnline } from './PatchesPending';
import type { PatchPendingAgent } from '@/api/types';

// ── Mocks de hooks ────────────────────────────────────────────────────────────
// Mesmo padrão de PatchesCompliance.test.tsx: os hooks de dados viram funções
// controladas pelo teste; a página roda de verdade (tabela real do DataTable).

vi.mock('@/hooks/useClients', () => ({
  useClients: () => ({
    data: [{ id: 'c1', name: 'Cliente Um' }],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

vi.mock('@/hooks/useSites', () => ({
  useSites: () => ({ data: [{ id: 's1', name: 'Site Matriz' }], isLoading: false, isError: false }),
}));

vi.mock('@/hooks/usePatches', () => ({
  usePatchPending: vi.fn(),
  useScanPatchScope: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/useAgentWindowsUpdates', () => ({
  useApproveAgentPendingWindowsUpdates: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useInstallApprovedWindowsUpdates: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useScanAgentWindowsUpdates: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/auth/authorization', () => ({
  useAuthorization: () => ({ hasAnyPermission: () => true }),
}));

// O "agora" da página é fixado pelo teste: a decisão de online vem do frescor de
// lastSeenAt comparado a esse instante. NÃO mockamos @/utils/agentStatus — a
// regra exercitada é a real (isAgentOnlineNow).
vi.mock('@/hooks/useNowTick', () => ({ useNowTick: vi.fn() }));

import { usePatchPending } from '@/hooks/usePatches';
import { useNowTick } from '@/hooks/useNowTick';

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** Instante fixo usado como "agora" em todos os casos (evita corrida de relógio). */
const NOW = new Date('2026-11-10T12:00:00.000Z').getTime();

/** Janela de frescor: VITE_AGENT_OFFLINE_FALLBACK_MS, 120s por padrão. */
const RECENTE = new Date(NOW - 10_000).toISOString(); // 10s atrás -> fresco
const ANTIGO = new Date(NOW - 2 * 24 * 60 * 60 * 1000).toISOString(); // 2 dias atrás

function agent(overrides: Partial<PatchPendingAgent> & Pick<PatchPendingAgent, 'agentId' | 'hostname'>): PatchPendingAgent {
  return {
    agentDisplayName: null,
    siteId: 's1',
    siteName: 'Site Matriz',
    clientId: 'c1',
    clientName: 'Cliente Um',
    pendingCount: 3,
    criticalCount: 1,
    deniedCount: 0,
    pendingReboot: false,
    scanStatus: 'ok',
    lastScanAt: '2026-11-10T11:00:00.000Z',
    lastSeenAt: null,
    ...overrides,
  };
}

const mockPending = (items: PatchPendingAgent[]) => {
  (usePatchPending as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    data: { items, nextCursor: null, hasMore: false },
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  });
};

function renderPage() {
  return render(
    <MemoryRouter>
      <PatchesPending />
    </MemoryRouter>,
  );
}

/** Os badges de status da tabela (o valor é o texto visível do badge). */
function badgesOnlineOffline(): string[] {
  return screen
    .queryAllByText(/^(Online|Offline)$/)
    .map((el) => el.textContent?.trim() ?? '');
}

describe('PatchesPending — indicador de agente online', () => {
  it('mostra um badge Online e um Offline para dois agentes (status + frescor)', () => {
    (useNowTick as unknown as ReturnType<typeof vi.fn>).mockReturnValue(NOW);
    mockPending([
      agent({ agentId: 'a1', hostname: 'ATIVO-01', status: 'Online', lastSeenAt: RECENTE }),
      agent({ agentId: 'a2', hostname: 'PARADO-01', status: 'Offline', lastSeenAt: ANTIGO }),
    ]);

    renderPage();

    // A página renderizou de verdade (não caiu em Loading/ErrorDisplay).
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Pendências de atualizações');
    // As duas linhas estão na tabela.
    expect(screen.getByText('ATIVO-01')).toBeTruthy();
    expect(screen.getByText('PARADO-01')).toBeTruthy();
    // Exatamente um Online e um Offline.
    expect(badgesOnlineOffline().sort()).toEqual(['Offline', 'Online']);

    // A coluna "Status" saiu da tabela: o badge vive agora na célula do nome.
    expect(screen.queryByRole('columnheader', { name: 'Status' })).toBeNull();
    expect(screen.queryByText('Status')).toBeNull();

    // E cada badge está na linha do agente certo.
    const linhaAtivo = screen.getByText('ATIVO-01').closest('tr') as HTMLElement;
    const linhaParado = screen.getByText('PARADO-01').closest('tr') as HTMLElement;
    expect(within(linhaAtivo).getByText('Online')).toBeTruthy();
    expect(within(linhaAtivo).queryByText('Offline')).toBeNull();
    expect(within(linhaParado).getByText('Offline')).toBeTruthy();
    expect(within(linhaParado).queryByText('Online')).toBeNull();
  });

  it('o frescor manda: status Offline com lastSeenAt de 10s aparece como Online', () => {
    (useNowTick as unknown as ReturnType<typeof vi.fn>).mockReturnValue(NOW);
    mockPending([
      agent({ agentId: 'a1', hostname: 'RECEM-VISTO', status: 'Offline', lastSeenAt: RECENTE }),
    ]);

    renderPage();

    const linha = screen.getByText('RECEM-VISTO').closest('tr') as HTMLElement;
    expect(within(linha).getByText('Online')).toBeTruthy();
    expect(within(linha).queryByText('Offline')).toBeNull();
    // O agente online continua mostrando os números normalmente.
    expect(within(linha).getByText('3')).toBeTruthy();
  });

  it('agente sem o campo status (payload antigo) e lastSeenAt antigo aparece como Offline', () => {
    (useNowTick as unknown as ReturnType<typeof vi.fn>).mockReturnValue(NOW);
    // Sem `status` algum: o backend antigo não mandava o campo.
    mockPending([agent({ agentId: 'a1', hostname: 'ANTIGO-SEM-STATUS', lastSeenAt: ANTIGO })]);

    renderPage();

    const linha = screen.getByText('ANTIGO-SEM-STATUS').closest('tr') as HTMLElement;
    expect(within(linha).getByText('Offline')).toBeTruthy();
  });

  it('sem status e sem lastSeenAt também é Offline (não quebra)', () => {
    (useNowTick as unknown as ReturnType<typeof vi.fn>).mockReturnValue(NOW);
    mockPending([agent({ agentId: 'a1', hostname: 'SEM-SINAL', lastSeenAt: null })]);

    renderPage();

    expect(screen.getByText('SEM-SINAL')).toBeTruthy();
    expect(badgesOnlineOffline()).toEqual(['Offline']);
  });

  it('status Online sem lastSeenAt ainda conta como Online (fallback ao status persistido)', () => {
    (useNowTick as unknown as ReturnType<typeof vi.fn>).mockReturnValue(NOW);
    mockPending([agent({ agentId: 'a1', hostname: 'SO-STATUS', status: 'Online', lastSeenAt: null })]);

    renderPage();

    const linha = screen.getByText('SO-STATUS').closest('tr') as HTMLElement;
    expect(within(linha).getByText('Online')).toBeTruthy();
  });

  it('isPendingAgentOnline: now explícito decide pelo frescor e cai no status depois', () => {
    // Fresco -> online, mesmo com status "Offline".
    expect(isPendingAgentOnline(agent({ agentId: 'a1', hostname: 'H1', status: 'Offline', lastSeenAt: RECENTE }), NOW)).toBe(true);
    // Antigo -> offline, mesmo com status "Online" (o frescor tem precedência).
    expect(isPendingAgentOnline(agent({ agentId: 'a1', hostname: 'H1', status: 'Online', lastSeenAt: ANTIGO }), NOW)).toBe(false);
    // Sem lastSeenAt: decide pelo status persistido.
    expect(isPendingAgentOnline(agent({ agentId: 'a1', hostname: 'H1', status: 'Online', lastSeenAt: null }), NOW)).toBe(true);
    expect(isPendingAgentOnline(agent({ agentId: 'a1', hostname: 'H1', status: 'Offline', lastSeenAt: null }), NOW)).toBe(false);
    // Sem status e sem lastSeenAt: offline.
    expect(isPendingAgentOnline(agent({ agentId: 'a1', hostname: 'H1', lastSeenAt: null }), NOW)).toBe(false);
  });
});
