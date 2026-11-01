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
        },
        count: 2,
        generatedAt: '2026-11-01T22:10:00Z',
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
    // Rodapé de segurança da simulação.
    expect(
      screen.getByText(
        /Simulação — nada é executado\. A execução do auto-update ainda não está ativa \(Fase 2\)\./,
      ),
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
        },
        count: 0,
        generatedAt: null,
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
        /Janela desligada: o auto-update não executaria fora da janela/,
      ),
    ).toBeTruthy();
    // Estado vazio da simulação.
    expect(
      screen.getByText('Nenhum pacote elegível para atualização neste escopo.'),
    ).toBeTruthy();
  });
});
