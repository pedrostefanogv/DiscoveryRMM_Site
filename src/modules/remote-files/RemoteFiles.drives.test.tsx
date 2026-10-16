import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import RemoteFiles from './RemoteFiles';
import { useFilesStream, type DriveInfo, type FilesReadyInfo, type FilesResponse } from './useFilesStream';

vi.mock('./useFilesStream', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./useFilesStream')>();
  return { ...actual, useFilesStream: vi.fn() };
});

const mockUseFilesStream = vi.mocked(useFilesStream);

const DRIVES: DriveInfo[] = [
  { name: 'C:', root: 'C:\\', label: 'Sistema', type: 'fixed', ready: true, totalBytes: 500, freeBytes: 250 },
  { name: 'D:', root: 'D:\\', label: 'Dados', type: 'fixed', ready: true, totalBytes: 1000, freeBytes: 500 },
];

type Stream = ReturnType<typeof useFilesStream>;

function setupStream(opts: { entries?: FilesResponse['entries']; drives?: DriveInfo[] } = {}) {
  let readyCb: ((info: FilesReadyInfo) => void) | null = null;
  const sendRequest = vi.fn(async (action: string, _path: string) => {
    if (action === 'drives') {
      return { success: true, drives: opts.drives ?? DRIVES } as FilesResponse;
    }
    if (action === 'list') {
      return { success: true, entries: opts.entries ?? [] } as FilesResponse;
    }
    return { success: true } as FilesResponse;
  });
  mockUseFilesStream.mockReturnValue({
    isConnected: true,
    sendRequest,
    onReady: (cb: (info: FilesReadyInfo) => void) => { readyCb = cb; return () => { readyCb = null; }; },
    onProgress: () => () => { /* noop */ },
    error: null,
  } as unknown as Stream);
  return {
    sendRequest,
    emitReady: (info: FilesReadyInfo) => readyCb?.(info),
  };
}

beforeEach(() => {
  mockUseFilesStream.mockReset();
});

function renderFiles() {
  return render(
    <RemoteFiles sessionId="s1" agentId="a1" natsSubject="sub" natsUrl="ws://nats" jwt="jwt" />,
  );
}

describe('RemoteFiles — seleção de disco', () => {
  it('oferece o seletor de disco quando o agent informa unidades', async () => {
    setupStream();
    renderFiles();

    const button = await screen.findByLabelText('Selecionar disco');
    expect(button).toBeTruthy();

    fireEvent.click(button);
    const dDrive = await screen.findByTitle('Abrir D:\\');
    fireEvent.click(dDrive);

    await waitFor(() => expect(screen.getByDisplayValue('D:\\')).toBeTruthy());
  });

  it('navega para o disco escolhido (list no novo root)', async () => {
    const { sendRequest } = setupStream();
    renderFiles();

    fireEvent.click(await screen.findByLabelText('Selecionar disco'));
    fireEvent.click(await screen.findByTitle('Abrir D:\\'));

    await waitFor(() => {
      expect(sendRequest).toHaveBeenCalledWith('list', 'D:\\');
    });
  });

  it('reconsulta as unidades ao abrir o seletor (disco plugado depois do start)', async () => {
    const { sendRequest } = setupStream();
    renderFiles();

    fireEvent.click(await screen.findByLabelText('Selecionar disco'));

    await waitFor(() => {
      const driveCalls = sendRequest.mock.calls.filter((c) => c[0] === 'drives');
      expect(driveCalls.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('esconde o seletor quando o agent não oferece unidades (sandbox em subpasta)', async () => {
    const { sendRequest } = setupStream({ drives: [] });
    renderFiles();

    await waitFor(() => expect(sendRequest).toHaveBeenCalledWith('drives', ''));
    expect(screen.queryByLabelText('Selecionar disco')).toBeNull();
  });
});

describe('RemoteFiles — itens ocultos', () => {
  it('esmaece a linha e mostra o selo "oculto"', async () => {
    setupStream({
      entries: [
        { name: 'pasta-oculta', path: 'C:\\pasta-oculta', isDir: true, size: 0, modTime: '2026-01-01T00:00:00Z', isHidden: true },
        { name: 'visivel.txt', path: 'C:\\visivel.txt', isDir: false, size: 10, modTime: '2026-01-01T00:00:00Z', isHidden: false },
      ],
    });
    renderFiles();

    const badge = await screen.findByText('oculto');
    const hiddenRow = badge.closest('tr');
    expect(hiddenRow?.className).toContain('opacity-70');
    expect(screen.getByRole('img', { name: 'Pasta (oculto)' })).toBeTruthy();
    // O padrão não eleva a opacidade de itens visíveis.
    const visibleRow = screen.getByText('visivel.txt').closest('tr');
    expect(visibleRow?.className).not.toContain('opacity-70');
  });
});
