import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Editor da política de auto-ticket — a peça que liga o recurso por
 * cliente/site.
 *
 * O que estes testes protegem:
 *  1. O operador consegue VER de onde cada campo veio (proveniência). Sem isso,
 *     um override distante vira mistério.
 *  2. O kill switch por escopo aparece quando um nível desliga o recurso.
 *  3. Ao salvar, campos vazios são OMITIDOS — é o que preserva a herança
 *     (um campo vazio não pode virar "null" e sobrescrever o nível superior).
 *  4. Campos vazios voltam a herdar, e o payload enviado reflete isso.
 */
const { getPolicyMock, saveClientPolicyMock, saveServerPolicyMock, listClientsMock, listSitesMock } =
  vi.hoisted(() => ({
    getPolicyMock: vi.fn(),
    saveClientPolicyMock: vi.fn(),
    saveServerPolicyMock: vi.fn(),
    listClientsMock: vi.fn(),
    listSitesMock: vi.fn(),
  }));

vi.mock('@/api', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/api');
  return {
    ...actual,
    autoTicketRulesApi: {
      getPolicy: getPolicyMock,
      saveServerPolicy: saveServerPolicyMock,
      saveClientPolicy: saveClientPolicyMock,
      saveSitePolicy: vi.fn(),
    },
    clientsApi: { list: listClientsMock },
    sitesApi: { list: listSitesMock },
  };
});

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

import { AutoTicketPolicyEditor, AutoTicketScopeSelector } from './AutoTicketPolicyEditor';

const EFFECTIVE = {
  enabled: true,
  mode: 'Canary',
  disabledByLevel: null,
  minConsecutiveFailures: 3,
  minDurationSeconds: 600,
  minImpactToOpen: 'Medium',
  minImpactToEscalate: 'High',
  openOnWarning: true,
  openOnPredictive: true,
  maintenanceGraceMinutes: 30,
  reNotifyAfterMaintenanceEnds: true,
  respectAgentMaintenance: true,
  respectMaintenanceWindow: true,
  suppressWhenHostNotReachable: true,
  dependencySuppressionEnabled: false,
  dependencyMaxDepth: 3,
  closeTicketResolvedDuringMaintenance: true,
  flapWindowMinutes: 60,
  flapTransitionsThreshold: 4,
  dedupWindowMinutes: 60,
  dedupWindowMaxHours: 24,
  reopenWindowMinutes: 0,
  maxCreatedTicketsPerHourPerAlertCode: 5,
  incrementOccurrenceCounter: true,
  neverTicketSensorKeys: ['cpu'],
  allowedSensorKeys: [],
  defaultDepartmentId: null,
  defaultCategory: null,
  aiMode: 'Suggest',
  aiMinConfidence: 0.6,
  aiSuggestibleFields: [],
  aiAllowEquipmentContext: true,
  aiAnonymizeAssetNames: false,
};

function renderEditor() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AutoTicketPolicyEditor level="Client" clientId="c1" />
    </QueryClientProvider>,
  );
}

describe('AutoTicketPolicyEditor', () => {
  beforeEach(() => {
    getPolicyMock.mockReset().mockResolvedValue({
      level: 'Client',
      targetId: 'c1',
      own: {},
      effective: EFFECTIVE,
      provenance: {
        enabled: 'Server',
        mode: 'Client',
        dedupWindowMinutes: 'Server',
      },
    });
    saveClientPolicyMock.mockReset().mockResolvedValue({});
    saveServerPolicyMock.mockReset().mockResolvedValue({});
    listClientsMock.mockReset().mockResolvedValue([]);
    listSitesMock.mockReset().mockResolvedValue([]);
  });

  afterEach(() => cleanup());

  it('mostra o valor efetivo e a proveniência de cada campo', async () => {
    renderEditor();

    expect(await screen.findByText(/Política efetiva/)).toBeTruthy();
    // O modo veio do Client; o operador precisa enxergar isso.
    expect(screen.getAllByText('Client').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Server').length).toBeGreaterThan(0);
  });

  it('exibe o nível que desligou, quando há kill switch', async () => {
    getPolicyMock.mockResolvedValue({
      level: 'Site',
      targetId: 's1',
      own: {},
      effective: { ...EFFECTIVE, enabled: false, mode: 'Off', disabledByLevel: 'Site' },
      provenance: { enabled: 'Site' },
    });

    renderEditor();

    expect(await screen.findByText(/Desligado no nível/)).toBeTruthy();
    expect(screen.getByText(/Nenhum chamado automático é criado neste escopo/)).toBeTruthy();
  });

  it('mostra os sensores que nunca abrem chamado', async () => {
    renderEditor();

    await screen.findByText(/Política efetiva/);
    expect(screen.getByText(/nunca/)).toBeTruthy();
  });

  it('OMITE campos vazios ao salvar, preservando a herança', async () => {
    renderEditor();
    await screen.findByText(/Política efetiva/);

    fireEvent.click(screen.getByRole('button', { name: /Salvar política deste nível/ }));

    await waitFor(() => expect(saveClientPolicyMock).toHaveBeenCalled());

    const payload = saveClientPolicyMock.mock.calls[0][1] as Record<string, unknown>;
    // O formulário começou vazio (own = {}), então nada deve ir — enviar
    // campos vazios quebraria a herança do nível superior.
    expect(Object.keys(payload)).toHaveLength(0);
  });

  it('envia o kill switch quando o operador escolhe "Não"', async () => {
    renderEditor();
    await screen.findByText(/Política efetiva/);

    fireEvent.change(screen.getByLabelText('Habilitado'), { target: { value: 'false' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar política deste nível/ }));

    await waitFor(() => expect(saveClientPolicyMock).toHaveBeenCalled());
    const payload = saveClientPolicyMock.mock.calls[0][1] as Record<string, unknown>;
    expect(payload.enabled).toBe(false);
  });

  it('converte a lista de sensores proibidos em array', async () => {
    renderEditor();
    await screen.findByText(/Política efetiva/);

    fireEvent.change(screen.getByLabelText(/Sensores que NUNCA abrem/), {
      target: { value: 'cpu, memory ,dns_latency' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Salvar política deste nível/ }));

    await waitFor(() => expect(saveClientPolicyMock).toHaveBeenCalled());
    const payload = saveClientPolicyMock.mock.calls[0][1] as Record<string, unknown>;
    expect(payload.neverTicketSensorKeys).toEqual(['cpu', 'memory', 'dns_latency']);
  });

  it('expõe o controle de contexto do equipamento para a IA (plugável)', async () => {
    renderEditor();
    await screen.findByText(/Política efetiva/);

    const select = screen.getByLabelText('IA pode receber contexto do equipamento');
    fireEvent.change(select, { target: { value: 'false' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar política deste nível/ }));

    await waitFor(() => expect(saveClientPolicyMock).toHaveBeenCalled());
    const payload = saveClientPolicyMock.mock.calls[0][1] as Record<string, unknown>;
    expect(payload.aiAllowEquipmentContext).toBe(false);
  });
});

describe('AutoTicketScopeSelector', () => {
  beforeEach(() => {
    listClientsMock.mockReset().mockResolvedValue([
      { id: 'c1', name: 'Cliente Um' },
      { id: 'c2', name: 'Cliente Dois' },
    ]);
    listSitesMock.mockReset().mockResolvedValue([{ id: 's1', name: 'Site Um' }]);
    getPolicyMock.mockReset().mockResolvedValue({
      level: 'Server',
      targetId: null,
      own: {},
      effective: { ...EFFECTIVE, enabled: false, mode: 'Off' },
      provenance: {},
    });
  });

  afterEach(() => cleanup());

  it('lista os clientes para escolher o escopo', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <AutoTicketScopeSelector />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('Cliente Um')).toBeTruthy();
    expect(screen.getByText('Cliente Dois')).toBeTruthy();
  });

  it('explica como desligar um escopo', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <AutoTicketScopeSelector />
      </QueryClientProvider>,
    );

    expect(await screen.findByText(/Como desligar um escopo/)).toBeTruthy();
    expect(screen.getByText(/clientes irmãos continuam funcionando/)).toBeTruthy();
  });
});
