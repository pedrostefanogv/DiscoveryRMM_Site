import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentContextMenu } from './AgentContextMenu';
import type { AgentCardAgent } from './AgentCard';

// ── Mocks ─────────────────────────────────────────────────────────────────────
// A página/menu rodam de verdade; só os hooks de dados e os lançadores de janela
// (window.open) viram funções controladas. O objetivo é exercitar a ÁRVORE de
// itens do menu — em especial o submenu "Patches" — e as regras de permissão.

// Tipados com o argumento real de cada hook: sem isso o TS infere uma tupla
// vazia e .mock.calls[0][0] deixa de compilar (os testes passariam no vitest,
// que não typecheca, mas o tsc -b reprovaria).
const scanSpy = vi.fn((_input: { agentId: string; reason?: string }) =>
  Promise.resolve({ message: 'varredura solicitada' }));
const approveSpy = vi.fn((_input: { agentId: string; action?: string; scope?: string; reason?: string }) =>
  Promise.resolve({ message: 'pendências aprovadas' }));
const installSpy = vi.fn((_input: { agentId: string; postAction?: string }) =>
  Promise.resolve({ message: 'instalação solicitada' }));

vi.mock('@/hooks/useAgentWindowsUpdates', () => ({
  useScanAgentWindowsUpdates: () => ({ mutateAsync: scanSpy, isPending: false }),
  useApproveAgentPendingWindowsUpdates: () => ({ mutateAsync: approveSpy, isPending: false }),
  useInstallApprovedWindowsUpdates: () => ({ mutateAsync: installSpy, isPending: false }),
}));

vi.mock('@/hooks/useAgents', () => ({
  useApproveZeroTouch: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteAgent: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRestartAgent: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useShutdownAgent: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useWakeOnLan: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/useAgentAlerts', () => ({
  useSendAgentNotification: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

// Permissões controladas por teste: o default libera tudo.
const hasAnyPermission = vi.fn((_permissions: string[]) => true);
vi.mock('@/auth/authorization', () => ({
  useAuthorization: () => ({ hasAnyPermission }),
}));

// Navegação observável (o menu passa a navegar para a aba de atualizações).
const navigateSpy = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateSpy };
});

// Lançadores abrem popup (window.open) — não queremos isso no jsdom.
vi.mock('@/pages/agents/remoteSessionLauncher', () => ({
  openRemoteSessionPopup: vi.fn(() => Promise.resolve()),
}));
vi.mock('@/pages/agents/remoteDebugLauncher', () => ({
  openRemoteDebugPopup: vi.fn(() => Promise.resolve()),
}));
vi.mock('@/pages/agents/agentSupportChatLauncher', () => ({
  openAgentSupportChatWindow: vi.fn(),
}));
vi.mock('@/pages/agents/agentDetailUtils', () => ({
  awaitAgentCommandById: vi.fn(() => Promise.resolve(null)),
  notifyAgentCommandOutcome: vi.fn(),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const NOW = new Date('2026-11-10T12:00:00.000Z').getTime();
const RECENTE = new Date(NOW - 10_000).toISOString();

function agent(overrides: Partial<AgentCardAgent> = {}): AgentCardAgent {
  return {
    id: 'a1',
    hostname: 'HOST-01',
    displayName: null,
    siteId: 's1',
    clientId: 'c1',
    clientName: 'Cliente Um',
    siteName: 'Site Matriz',
    status: 'Online',
    lastSeenAt: RECENTE,
    ...overrides,
  } as unknown as AgentCardAgent;
}

/**
 * Os componentes reais do menu (modais de energia, notificação etc.) usam
 * react-query, então o QueryClientProvider é obrigatório — sem ele o render
 * falha com "No QueryClient set". Um client por render, sem retry, para o teste
 * não ficar esperando rede.
 */
function renderMenu(agentOverrides: Partial<AgentCardAgent> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AgentContextMenu agent={agent(agentOverrides)} now={NOW} position={{ x: 10, y: 10 }} onClose={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/**
 * Gatilho do submenu "Patches".
 *
 * O ContextMenu renderiza o pai de um submenu como um <button aria-haspopup="menu">
 * — NÃO como role="menuitem" (só os filhos recebem esse role). Buscar por menuitem
 * aqui devolveria errado, por isso localizamos pela aria-haspopup.
 */
function gatilhoPatches(): HTMLElement {
  return screen
    .getAllByRole('button')
    .find((botao) => botao.getAttribute('aria-haspopup') === 'menu' && /Patches/.test(botao.textContent ?? '')) as HTMLElement;
}

beforeEach(() => {
  navigateSpy.mockClear();
  scanSpy.mockClear();
  approveSpy.mockClear();
  installSpy.mockClear();
  hasAnyPermission.mockReturnValue(true);
});

afterEach(() => cleanup());

describe('AgentContextMenu — submenu Patches', () => {
  it('oferece o submenu "Patches" junto das ações do agente', () => {
    renderMenu();

    const gatilho = gatilhoPatches();
    expect(gatilho).toBeTruthy();
    // É um submenu de verdade (aria-haspopup), fechado até o hover.
    expect(gatilho.getAttribute('aria-expanded')).toBe('false');
  });

  it('expõe as três ações de Windows Update e o atalho para a aba', () => {
    renderMenu();

    // Abre o submenu (o ContextMenu abre no hover do grupo).
    fireEvent.mouseOver(gatilhoPatches());

    for (const nome of ['Verificar atualizações', 'Aprovar pendentes', 'Instalar aprovadas', 'Abrir aba de atualizações']) {
      expect(screen.getByRole('menuitem', { name: new RegExp(nome) })).toBeTruthy();
    }
  });

  it('cada ação chama o hook de patch correspondente, uma única vez', () => {
    renderMenu();
    fireEvent.mouseOver(gatilhoPatches());

    fireEvent.click(screen.getByRole('menuitem', { name: /Verificar atualizações/ }));
    expect(scanSpy).toHaveBeenCalledTimes(1);
    expect(scanSpy.mock.calls[0][0]).toMatchObject({ agentId: 'a1' });

    // Reabre para o próximo item (o clique fecha o menu).
    fireEvent.mouseOver(gatilhoPatches());
    fireEvent.click(screen.getByRole('menuitem', { name: /Aprovar pendentes/ }));
    expect(approveSpy).toHaveBeenCalledTimes(1);
    expect(approveSpy.mock.calls[0][0]).toMatchObject({ agentId: 'a1', action: 'Approve', scope: 'Agent' });

    fireEvent.mouseOver(gatilhoPatches());
    fireEvent.click(screen.getByRole('menuitem', { name: /Instalar aprovadas/ }));
    expect(installSpy).toHaveBeenCalledTimes(1);
    expect(installSpy.mock.calls[0][0]).toMatchObject({ agentId: 'a1', postAction: 'none' });
  });

  it('"Abrir aba de atualizações" navega para a aba correta do agente', () => {
    renderMenu();
    fireEvent.mouseOver(gatilhoPatches());

    fireEvent.click(screen.getByRole('menuitem', { name: /Abrir aba de atualizações/ }));

    expect(navigateSpy).toHaveBeenCalledWith('/agents/a1?tab=atualizacoes');
  });

  it('sem permissão de patch as ações de escrita ficam desabilitadas', () => {
    // Só quem tem permissão de AGENTE: nenhuma família de patches.
    hasAnyPermission.mockImplementation((perms: string[]) =>
      perms.some((p) => p.startsWith('Agents.') || p.startsWith('agents.')),
    );

    renderMenu();
    fireEvent.mouseOver(gatilhoPatches());

    for (const nome of ['Verificar atualizações', 'Aprovar pendentes', 'Instalar aprovadas']) {
      expect((screen.getByRole('menuitem', { name: new RegExp(nome) }) as HTMLButtonElement).disabled).toBe(true);
    }

    // O atalho de navegação não depende de permissão de patch: continua ativo.
    const atalho = screen.getByRole('menuitem', { name: /Abrir aba de atualizações/ }) as HTMLButtonElement;
    expect(atalho.disabled).toBe(false);
  });

  it('agente offline NÃO bloqueia as ações de patch (entram na fila)', () => {
    renderMenu({ status: 'Offline', lastSeenAt: new Date(NOW - 2 * 24 * 60 * 60 * 1000).toISOString() });

    fireEvent.mouseOver(gatilhoPatches());

    // Comando persistido: o dispatcher entrega quando o agente reconectar, então
    // a permissão (presente) é o único bloqueio — não o sinal de online.
    for (const nome of ['Verificar atualizações', 'Aprovar pendentes', 'Instalar aprovadas']) {
      expect((screen.getByRole('menuitem', { name: new RegExp(nome) }) as HTMLButtonElement).disabled).toBe(false);
    }
  });
});