import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Card de Processamento em Segundo Plano: modo global, modo override (com
 * herdado do global por campo), status dos ciclos e ações (rodar agora/backfill).
 */
const {
  jobsTrigger,
  requestBackfillMock,
  cancelBackfillMock,
  effectiveState,
  statusState,
  scheduleState,
  onSaveMock,
} = vi.hoisted(() => ({
  jobsTrigger: vi.fn(() => Promise.resolve({})),
  requestBackfillMock: vi.fn(),
  cancelBackfillMock: vi.fn(),
  effectiveState: { data: undefined as unknown },
  statusState: { data: undefined as unknown, isLoading: false, isError: false },
  scheduleState: { data: undefined as unknown },
  onSaveMock: vi.fn((_json: string) => Promise.resolve()),
}));

vi.mock('@/api', () => ({ jobsApi: { trigger: jobsTrigger } }));

vi.mock('@/hooks/useBackgroundProcessing', () => ({
  useBackgroundProcessingEffective: () => effectiveState,
  useBackgroundProcessingStatus: () => statusState,
  useBackgroundProcessingSchedule: () => scheduleState,
  useRequestBackgroundBackfill: () => ({ mutate: requestBackfillMock, isPending: false }),
  useCancelBackgroundBackfill: () => ({ mutate: cancelBackfillMock, isPending: false }),
}));

import { BackgroundProcessingCard } from './BackgroundProcessingCard';

const effective = {
  metrics: {
    enabled: true,
    tickSeconds: 300,
    intervalMinutes: 60,
    staleThresholdMinutes: 15,
    windowDays: 90,
    batchSize: 200,
    maxBatchesPerRun: 4,
    maxRunSeconds: 120,
    bootstrapMissingSnapshots: true,
  },
  triage: {
    enabled: true,
    enqueueOnCreate: true,
    tickSeconds: 20,
    intervalSeconds: 20,
    batchSize: 25,
    maxPerClientPerRun: 10,
    maxAttempts: 3,
    retryAfterMinutes: 5,
    batchDelaySeconds: 0,
  },
};

describe('BackgroundProcessingCard', () => {
  beforeEach(() => {
    effectiveState.data = effective;
    statusState.data = [];
    scheduleState.data = {
      appliedAt: '2026-01-01T00:00:00Z',
      processes: [
        { process: 'technician_metrics', jobName: 'technician-metrics-refresh', jobGroup: 'tickets', tickSeconds: 300, appliedTickSeconds: 300, enabled: true, nextFireTimeUtc: '2026-01-01T00:05:00Z' },
      ],
    };
    jobsTrigger.mockClear();
    requestBackfillMock.mockClear();
    cancelBackfillMock.mockClear();
    onSaveMock.mockClear();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => cleanup());

  it('modo global salva o JSON completo e mostra o status dos ciclos', () => {
    statusState.data = [
      {
        id: 's1',
        scopeType: 'technician_metrics',
        scopeId: '00000000-0000-0000-0000-000000000000',
        lastRunAt: new Date(Date.now() - 5 * 60000).toISOString(),
        lastResultJson: '{"updated":5,"pending":1}',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ];

    render(<BackgroundProcessingCard mode="global" settings={effective as never} onSave={onSaveMock} />);

    expect(screen.getByText('Processamento em Segundo Plano')).toBeTruthy();
    expect(screen.getByText('Métricas por atendente')).toBeTruthy();
    expect(screen.getByText('Triagem por IA')).toBeTruthy();
    expect(screen.getByText(/snapshots 5 · pendentes 1/)).toBeTruthy();
    expect(screen.getByText(/tick 300s/)).toBeTruthy();

    fireEvent.click(screen.getByText('Salvar configuração'));

    const payload = JSON.parse(onSaveMock.mock.calls[0][0] as string);
    expect(payload.metrics.intervalMinutes).toBe(60);
    expect(payload.metrics.tickSeconds).toBe(300);
    expect(payload.triage.enqueueOnCreate).toBe(true);
  });

  it('modo override mostra herdado do global e salva apenas os campos sobrescritos', () => {
    render(
      <BackgroundProcessingCard
        mode="override"
        clientId="c1"
        settings={{ metrics: { batchSize: 50 }, triage: {} } as never}
        onSave={onSaveMock}
      />,
    );

    expect(screen.getByText(/herdado do global: 60/)).toBeTruthy();

    fireEvent.click(screen.getByText('Salvar configuração'));

    const payload = JSON.parse(onSaveMock.mock.calls[0][0] as string);
    expect(payload.metrics.batchSize).toBe(50);
    expect(payload.metrics.intervalMinutes).toBeUndefined();
    expect(Object.keys(payload.triage)).toHaveLength(0);
  });

  it('dispara ciclos e permite cancelar o backfill em andamento', () => {
    statusState.data = [
      {
        id: 'b1',
        scopeType: 'technician_metrics_backfill',
        scopeId: '00000000-0000-0000-0000-000000000000',
        lastRunAt: '2026-01-01T00:00:00Z',
        lastResultJson: '{"status":"running","processed":10,"total":100}',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ];

    render(<BackgroundProcessingCard mode="global" settings={effective as never} onSave={onSaveMock} />);

    expect(screen.getByText(/backfill 10\/100 \(running\)/)).toBeTruthy();
    expect(screen.getByText(/Backfill: running — 10\/100/)).toBeTruthy();

    fireEvent.click(screen.getByText('Rodar métricas agora'));
    expect(jobsTrigger).toHaveBeenCalledWith('tickets', 'technician-metrics-refresh', true);

    fireEvent.click(screen.getByText('Cancelar backfill'));
    expect(cancelBackfillMock.mock.calls[0][0]).toEqual({ clientId: null });
  });

  it('no card global lista apenas o escopo global (não mistura clientes)', () => {
    statusState.data = [
      {
        id: 'g1',
        scopeType: 'technician_metrics',
        scopeId: '00000000-0000-0000-0000-000000000000',
        lastRunAt: '2026-01-01T00:00:00Z',
        lastResultJson: '{"updated":1,"pending":0}',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'c1',
        scopeType: 'technician_metrics',
        scopeId: '11111111-1111-1111-1111-111111111111',
        lastRunAt: '2026-01-01T00:00:00Z',
        lastResultJson: '{"updated":9,"pending":0}',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ];

    render(<BackgroundProcessingCard mode="global" settings={effective as never} onSave={onSaveMock} />);

    expect(screen.getByText(/snapshots 1 · pendentes 0/)).toBeTruthy();
    expect(screen.queryByText(/snapshots 9 · pendentes 0/)).toBeNull();
  });

  it('interpreta backfill legado gravado em PascalCase (sem perder progresso/cancelamento)', () => {
    statusState.data = [
      {
        id: 'b1',
        scopeType: 'technician_metrics_backfill',
        scopeId: '00000000-0000-0000-0000-000000000000',
        lastRunAt: '2026-01-01T00:00:00Z',
        lastResultJson: '{"Total":100,"Status":"running","Processed":10,"LastError":null}',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ];

    render(<BackgroundProcessingCard mode="global" settings={effective as never} onSave={onSaveMock} />);

    expect(screen.getByText(/backfill 10\/100 \(running\)/)).toBeTruthy();
    expect(screen.getByText(/Backfill: running — 10\/100/)).toBeTruthy();
    expect(screen.getByText('Cancelar backfill')).toBeTruthy();
  });
});
