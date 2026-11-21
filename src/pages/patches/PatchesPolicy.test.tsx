import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PatchesPolicy from './PatchesPolicy';

const mocks = vi.hoisted(() => ({
  globalPolicy: {
    enforcementMode: 'AgentEnforced',
    autoInstallEnabled: true,
    autoApproveSeverities: ['Critical'],
    autoApproveClassifications: ['Security Updates'],
    rebootPolicy: 'Never',
    rebootAllowed: false,
    maxInstallsPerRun: 25,
    hideDeniedUpdates: false,
    deferralDays: 3,
    deadlineDays: 7,
    sources: ['os'],
    allowThirdPartyApps: false,
    maintenanceWindowJson: JSON.stringify({
      days: [1, 3, 5],
      start: '23:00',
      end: '04:00',
      timezone: 'America/Sao_Paulo',
    }),
  },
  clientPolicyNoWindow: {
    enforcementMode: 'Monitor',
    autoInstallEnabled: false,
    autoApproveSeverities: [],
    autoApproveClassifications: [],
    rebootPolicy: 'Never',
    rebootAllowed: false,
    maxInstallsPerRun: 50,
    hideDeniedUpdates: false,
    deferralDays: 0,
    deadlineDays: 0,
    sources: ['os'],
    allowThirdPartyApps: false,
    maintenanceWindowJson: null,
  },
  mutateAsync: vi.fn(),
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/auth/authorization', () => ({
  useAuthorization: () => ({
    hasAnyPermission: () => true,
  }),
}));

vi.mock('@/hooks/useClients', () => ({
  useClients: () => ({
    data: [{ id: 'c1', name: 'Cliente Alpha' }],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

vi.mock('@/hooks/useSites', () => ({
  useSites: () => ({
    data: [],
    isLoading: false,
  }),
}));

vi.mock('@/hooks/usePatches', () => ({
  usePatchPolicy: (scopeType: string, scopeId?: string) => ({
    data:
      scopeType === 'Global'
        ? mocks.globalPolicy
        : scopeType === 'Client' && scopeId === 'c1'
          ? mocks.clientPolicyNoWindow
          : undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useUpdatePatchPolicy: () => ({
    mutateAsync: mocks.mutateAsync,
    isPending: false,
  }),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <PatchesPolicy />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.mutateAsync.mockResolvedValue({});
});

afterEach(() => {
  cleanup();
});

describe('PatchesPolicy', () => {
  it('renderiza seletor visual de dias e envia o JSON correto ao salvar', async () => {
    renderPage();

    const seg = screen.getByRole('button', { name: 'Seg' });
    const ter = screen.getByRole('button', { name: 'Ter' });
    expect(seg.getAttribute('aria-pressed')).toBe('true');
    expect(ter.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(ter);
    expect(ter.getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getAllByRole('button', { name: /Salvar/ })[0]);

    await waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalledTimes(1));
    const payload = mocks.mutateAsync.mock.calls[0][0];
    expect(JSON.parse(payload.body.maintenanceWindowJson).days).toEqual([1, 2, 3, 5]);
  });

  it('desmarca o 2º consentimento quando a origem de terceiros é desabilitada', () => {
    renderPage();

    const thirdParty = screen.getByLabelText(/Aplicativos de terceiros/) as HTMLInputElement;
    const secondConsent = screen.getByLabelText(/2º consentimento/) as HTMLInputElement;

    expect(secondConsent.disabled).toBe(true);
    fireEvent.click(thirdParty);
    expect(secondConsent.disabled).toBe(false);

    fireEvent.click(secondConsent);
    expect(secondConsent.checked).toBe(true);

    fireEvent.click(thirdParty);
    expect(secondConsent.checked).toBe(false);
    expect(secondConsent.disabled).toBe(true);
  });

  it('reseta a janela para o padrão ao trocar para um escopo sem maintenanceWindowJson', () => {
    renderPage();

    expect((screen.getByLabelText('Início') as HTMLInputElement).value).toBe('23:00');

    fireEvent.change(screen.getByLabelText('Escopo'), { target: { value: 'Client' } });
    fireEvent.change(screen.getByLabelText('Cliente'), { target: { value: 'c1' } });

    expect((screen.getByLabelText('Início') as HTMLInputElement).value).toBe('22:00');
    expect(screen.getByRole('button', { name: 'Ter' }).getAttribute('aria-pressed')).toBe('true');
  });
});
