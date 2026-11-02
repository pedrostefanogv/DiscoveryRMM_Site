import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Modal "Simular Atualizações": a consulta vem do hook mockado — a simulação é
 * apenas leitura, então o teste cobre a renderização (dono Automação, badge de
 * conflito, aviso da janela e rodapé de segurança).
 */

const mocks = vi.hoisted(() => ({
  useAppStoreUpdateIntent: vi.fn(),
}));

vi.mock('@/hooks/useAppStore', () => ({
  useAppStoreUpdateIntent: mocks.useAppStoreUpdateIntent,
}));

import { UpdateIntentModal } from './UpdateIntentModal';
import { AppApprovalScopeType } from '@/api/types';
import { AppUpdateOwner } from '@/api/appStoreUpdateIntent';

const queryDefaults = {
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
};

afterEach(() => cleanup());

describe('UpdateIntentModal', () => {
  it('mostra o dono "Automação" com o nome da tarefa e o badge de conflito com o motivo', () => {
    mocks.useAppStoreUpdateIntent.mockReturnValue({
      ...queryDefaults,
      data: {
        scopeType: AppApprovalScopeType.Global,
        scopeId: null,
        installationType: 0,
        policy: 'PreApproved',
        maintenanceWindow: {
          enabled: true,
          startTime: '02:00',
          timeZone: 'America/Sao_Paulo',
          startUtc: '05:00',
          durationMinutes: 120,
          rebootGraceSeconds: 60,
          daysOfWeek: [1, 2, 3, 4, 5],
          isOpenNow: false,
          nextStartUtc: '2026-11-02T05:00:00Z',
          endUtc: null,
        },
        count: 2,
        generatedAt: '2026-11-01T22:10:00Z',
        truncated: false,
        items: [
          {
            packageId: 'Microsoft.DotNet.CodeContracts',
            packageName: 'Microsoft .NET CodeContracts',
            action: 0,
            autoUpdateEnabled: true,
            owner: AppUpdateOwner.Automation,
            automationTaskId: 't1',
            automationTaskName: 'Navegadores',
            automationTriggerSummary: 'Recorrente (cron: 0 3 * * *)',
            conflict: true,
            conflictReason:
              'Auto-atualização ligada, mas a automação "Navegadores" já atualiza este pacote.',
          },
          {
            packageId: 'google.chrome',
            packageName: 'Google Chrome',
            action: 0,
            autoUpdateEnabled: false,
            owner: AppUpdateOwner.Manual,
            automationTaskId: null,
            automationTaskName: null,
            automationTriggerSummary: null,
            conflict: false,
            conflictReason: null,
          },
        ],
      },
    });

    render(
      <UpdateIntentModal
        open
        onClose={vi.fn()}
        scopeType={AppApprovalScopeType.Global}
      />,
    );

    expect(screen.getByText(/Automação "Navegadores"/)).toBeTruthy();
    expect(
      screen.getByText(
        /Auto-atualização ligada, mas a automação "Navegadores" já atualiza este pacote\./,
      ),
    ).toBeTruthy();
    expect(screen.getByText('Microsoft.DotNet.CodeContracts')).toBeTruthy();
    expect(screen.getByText('google.chrome')).toBeTruthy();
    // Próxima abertura da janela (contrato novo; ausência na API antiga não quebra).
    expect(
      screen.getByText(/Próxima janela abre em 2026-11-02T05:00:00Z \(UTC\)\./),
    ).toBeTruthy();
    // Rodapé de segurança: simulação não executa nada, mas o agent já executa.
    expect(
      screen.getByText(/Simulação — nada é executado aqui\. Quando ativo, quem executa é o agent/),
    ).toBeTruthy();
  });

  it('avisa quando a janela de manutenção está desligada e mostra estado vazio', () => {
    mocks.useAppStoreUpdateIntent.mockReturnValue({
      ...queryDefaults,
      data: {
        scopeType: AppApprovalScopeType.Global,
        scopeId: null,
        installationType: 0,
        policy: 'PreApproved',
        maintenanceWindow: {
          enabled: false,
          startTime: null,
          timeZone: null,
          startUtc: null,
          durationMinutes: null,
          rebootGraceSeconds: null,
          daysOfWeek: [],
          isOpenNow: false,
          nextStartUtc: null,
          endUtc: null,
        },
        count: 0,
        generatedAt: null,
        truncated: false,
        items: [],
      },
    });

    render(
      <UpdateIntentModal
        open
        onClose={vi.fn()}
        scopeType={AppApprovalScopeType.Global}
      />,
    );

    expect(screen.getByText('Desligada')).toBeTruthy();
    expect(
      screen.getByText(
        /Janela desligada: o auto-update NÃO é executado — configure a janela de manutenção/,
      ),
    ).toBeTruthy();
    // Estado vazio da simulação.
    expect(
      screen.getByText('Nenhum pacote elegível para atualização neste escopo.'),
    ).toBeTruthy();
  });
it('avisa quando a simulação foi truncada pelo limite de pacotes', () => {
    mocks.useAppStoreUpdateIntent.mockReturnValue({
      ...queryDefaults,
      data: {
        scopeType: AppApprovalScopeType.Global,
        scopeId: null,
        installationType: 0,
        policy: 'PreApproved',
        maintenanceWindow: null,
        count: 1,
        generatedAt: null,
        truncated: true,
        items: [
          {
            packageId: 'google.chrome',
            packageName: 'Google Chrome',
            action: 0,
            autoUpdateEnabled: true,
            owner: AppUpdateOwner.AutoUpdate,
            automationTaskId: null,
            automationTaskName: null,
            automationTriggerSummary: null,
            conflict: false,
            conflictReason: null,
          },
        ],
      },
    });

    render(
      <UpdateIntentModal
        open
        onClose={vi.fn()}
        scopeType={AppApprovalScopeType.Global}
      />,
    );

    expect(screen.getByText('Simulação truncada (limite de pacotes).')).toBeTruthy();
    expect(screen.getByText('Auto-update')).toBeTruthy();
  });

  it('pede o escopo quando Cliente/Site/Agente está sem id (e não consulta)', () => {
    const hook = vi.fn().mockReturnValue({
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      data: undefined,
    });
    mocks.useAppStoreUpdateIntent.mockImplementation(hook);

    render(
      <UpdateIntentModal
        open
        onClose={vi.fn()}
        scopeType={AppApprovalScopeType.Client}
      />,
    );

    expect(screen.getByText('Selecione um cliente, site ou agente para simular.')).toBeTruthy();
    // A consulta fica desligada: escopo sem id devolveria 400 no servidor.
    expect(hook).toHaveBeenCalledWith(expect.anything(), { enabled: false });
    // Restaura o mock dos outros testes.
    mocks.useAppStoreUpdateIntent.mockReset();
  });
});
