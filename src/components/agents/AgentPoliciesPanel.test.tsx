import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import type {
  AgentAutomationPolicyPreview,
  AgentAutomationTaskPolicy,
} from '@/api';
import AgentPoliciesPanel from './AgentPoliciesPanel';

function policy(over: Partial<AgentAutomationTaskPolicy> = {}): AgentAutomationTaskPolicy {
  return {
    taskId: 't1',
    name: 'Instalar Chrome',
    description: 'Navegador padrão do parque',
    actionType: 'InstallPackage',
    installationType: 'Winget',
    packageId: 'Google.Chrome',
    scriptId: null,
    commandPayload: null,
    scopeType: 'Global',
    requiresApproval: false,
    allowDefer: true,
    closeProcesses: [],
    promptTimeoutSeconds: 60,
    notificationMode: 'Silent',
    toastTiming: 'After',
    triggerImmediate: true,
    triggerRecurring: false,
    triggerOnUserLogin: false,
    triggerOnAgentCheckIn: false,
    scheduleCron: null,
    includeTags: [],
    excludeTags: [],
    lastUpdatedAt: '2026-10-08T12:00:00Z',
    script: null,
    ...over,
  };
}

function preview(over: Partial<AgentAutomationPolicyPreview> = {}): AgentAutomationPolicyPreview {
  return {
    agentId: 'a1',
    policyFingerprint: 'abc123def4567890',
    lastSyncedPolicyFingerprint: 'abc123def4567890',
    lastPolicySyncAt: '2026-10-08T11:00:00Z',
    upToDate: true,
    generatedAt: '2026-10-08T12:00:00Z',
    taskCount: 1,
    tasks: [policy()],
    preloadPackages: [],
    ...over,
  };
}

function renderPanel(over: Partial<ComponentProps<typeof AgentPoliciesPanel>> = {}) {
  const props: ComponentProps<typeof AgentPoliciesPanel> = {
    canView: true,
    canForceSync: false,
    policies: preview(),
    isLoading: false,
    isError: false,
    onRetry: vi.fn(),
    isRefreshing: false,
    onRefresh: vi.fn(),
    isForcing: false,
    onForceSync: vi.fn(),
    ...over,
  };
  return render(<AgentPoliciesPanel {...props} />);
}

afterEach(() => cleanup());

describe('AgentPoliciesPanel', () => {
  it('lista a política com ação, escopo e gatilho', () => {
    renderPanel();

    expect(screen.getByText('Instalar Chrome')).toBeTruthy();
    expect(screen.getByText('Instalar pacote')).toBeTruthy();
    expect(screen.getByText('Global')).toBeTruthy();
    expect(screen.getByText('Imediato')).toBeTruthy();
    // Fingerprint aparece (encurtado) para o operador comparar com o último sync.
    // Aparece no subtítulo e na nota explicativa — basta existir.
    expect(screen.getAllByText(/fingerprint/).length).toBeGreaterThan(0);
    expect(screen.getByText(/abc123def456/)).toBeTruthy();
  });

  it('mostra o estado vazio quando nenhuma política se aplica', () => {
    renderPanel({ policies: preview({ taskCount: 0, tasks: [] }) });

    expect(screen.getByText('Nenhuma política aplicável')).toBeTruthy();
  });

  it('mostra o estado de erro com ação de tentar novamente', () => {
    renderPanel({ policies: undefined, isError: true });

    expect(screen.getByText('Não foi possível carregar as políticas')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Tentar novamente/ })).toBeTruthy();
  });

  it('indica agent atualizado quando o fingerprint entregue é o vigente', () => {
    renderPanel();

    expect(screen.getByText('Agent atualizado')).toBeTruthy();
  });

  it('indica agent desatualizado quando o fingerprint entregue é outro', () => {
    renderPanel({
      policies: preview({
        upToDate: false,
        lastSyncedPolicyFingerprint: 'fingerprint-antigo',
        lastPolicySyncAt: '2026-10-01T00:00:00Z',
      }),
    });

    expect(screen.getByText('Agent desatualizado')).toBeTruthy();
  });

  it('indica "nunca recebeu" quando não há fingerprint registrado', () => {
    renderPanel({
      policies: preview({
        upToDate: false,
        lastSyncedPolicyFingerprint: null,
        lastPolicySyncAt: null,
      }),
    });

    expect(screen.getByText('Nunca recebeu')).toBeTruthy();
  });

  it('oferece "Forçar sincronização" quando o agent está desatualizado', () => {
    const onForceSync = vi.fn();
    renderPanel({
      canForceSync: true,
      onForceSync,
      policies: preview({ upToDate: false, lastSyncedPolicyFingerprint: 'fingerprint-antigo' }),
    });

    fireEvent.click(screen.getByRole('button', { name: /Forçar sincronização/ }));
    expect(onForceSync).toHaveBeenCalledTimes(1);
  });

  it('não oferece "Forçar sincronização" quando o agent está atualizado', () => {
    renderPanel({ canForceSync: true });

    expect(screen.queryByRole('button', { name: /Forçar sincronização/ })).toBeNull();
  });

  it('explica a falta de permissão sem mostrar "nenhuma política"', () => {
    renderPanel({ canView: false, policies: undefined });

    expect(screen.getByText('Sem permissão para ver as políticas')).toBeTruthy();
    expect(screen.queryByText('Nenhuma política aplicável')).toBeNull();
  });

  it('lista os pacotes de pré-carga P2P quando existem', () => {
    renderPanel({
      policies: preview({
        preloadPackages: [{ packageId: 'Google.Chrome', actionType: 'InstallPackage' }],
      }),
    });

    expect(screen.getByText(/Pré-carga P2P/)).toBeTruthy();
  });
});
