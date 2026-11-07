/**
 * CORREÇÃO C2 — player de gravação não pode usar navegação nativa.
 *
 * O backend autentica SÓ por header Authorization (Bearer em memória,
 * client.ts:380-385). Um <a href>/<source src> apontando para endpoint
 * protegido é NAVEGAÇÃO NATIVA do navegador: nunca leva o header => 401 sempre.
 *
 * Defeitos cobertos:
 *  (A) RecordingPlayer usava <a href={downloadUrl} download> (antigo :31) e
 *      <source src={downloadUrl}> (antigo :49).
 *  (B) useRecording montava a URL '/api/v1/remote-sessions/{agentId}/recording/download'
 *      SEM sessionId (antigo :26), enquanto a rota real é
 *      {agentId:guid}/{sessionId:guid}/recording/download (RemoteSessionsController.cs:222).
 *
 * Estes testes são de COMPORTAMENTO: falham contra o código antigo e passam
 * contra o corrigido.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import { RecordingPlayer } from './RecordingPlayer';
import { fetchRecordingBlob, describeError } from './useRecording';
import { ApiError, configureApiClient } from '@/api/client';

const AGENT = '01a189d0-8076-7ddd-b55e-d7ca6054e5ab';
const SESSION = '11111111-2222-3333-4444-555555555555';
const API_BASE = 'http://localhost:3000';

/** Captura as URLs chamadas por fetch e devolve respostas controladas. */
function stubFetch(handlers: (url: string) => Response) {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      calls.push(String(url));
      return handlers(String(url));
    }),
  );
  return calls;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('C2(A) — RecordingPlayer não navega para endpoint autenticado', () => {
  beforeEach(() => {
    configureApiClient({
      getAccessToken: () => 'jwt-de-teste',
      refreshAccessToken: async () => null,
      onAuthFailure: () => {},
    });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake-object-url');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('o vídeo usa object URL (blob:), NUNCA o endpoint protegido', async () => {
    stubFetch(() =>
      new Response(new Blob(['video-bytes'], { type: 'video/webm' }), { status: 200 }),
    );

    const { container } = render(
      <RecordingPlayer downloadUrl={`${API_BASE}/api/v1/remote-sessions/${AGENT}/${SESSION}/recording/download`} />,
    );

    await waitFor(() => {
      const source = container.querySelector('video source');
      expect(source).toBeTruthy();
      expect(source!.getAttribute('src')).toMatch(/^blob:/);
    });

    // A prova do defeito: nenhum elemento pode apontar para o endpoint cru.
    expect(container.querySelector('a[href*="/recording/download"]')).toBeNull();
    expect(container.querySelector('source[src*="/recording/download"]')).toBeNull();
  });

  it('o fetch do vídeo carrega o header Authorization', async () => {
    const seen: Headers[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        seen.push(new Headers(init?.headers));
        return new Response(new Blob(['v'], { type: 'video/webm' }), { status: 200 });
      }),
    );

    render(<RecordingPlayer downloadUrl={`${API_BASE}/api/v1/remote-sessions/${AGENT}/${SESSION}/recording/download`} />);

    await waitFor(() => expect(seen.length).toBeGreaterThan(0));
    expect(seen[0].get('Authorization')).toBe('Bearer jwt-de-teste');
  });

  it('401 vira mensagem de sessão expirada (não erro genérico)', async () => {
    stubFetch(() => jsonResponse({ message: 'Autenticação necessária.' }, 401));

    render(<RecordingPlayer downloadUrl={`${API_BASE}/api/v1/remote-sessions/${AGENT}/${SESSION}/recording/download`} />);

    await waitFor(() =>
      expect(screen.getByText(/Sessão expirada/)).toBeTruthy(),
    );
  });

  it('falha de rede é distinguida de falha de auth', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));

    render(<RecordingPlayer downloadUrl={`${API_BASE}/api/v1/remote-sessions/${AGENT}/${SESSION}/recording/download`} />);

    await waitFor(() => expect(screen.getByText(/Falha de rede/)).toBeTruthy());
  });

  it('o botão de download busca o blob autenticado e usa <a download> temporário', async () => {
    stubFetch(() =>
      new Response(new Blob(['video-bytes'], { type: 'video/webm' }), { status: 200 }),
    );

    // Espiona o anchor criado dinamicamente para o download.
    const clickSpy = vi.fn();
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreate(tag);
      if (tag === 'a') {
        (el as HTMLAnchorElement).click = clickSpy;
      }
      return el;
    });

    render(<RecordingPlayer downloadUrl={`${API_BASE}/api/v1/remote-sessions/${AGENT}/${SESSION}/recording/download`} />);

    const button = await screen.findByRole('button', { name: /Download/i });
    fireEvent.click(button);

    await waitFor(() => expect(clickSpy).toHaveBeenCalled());
  });

  it('revoga o object URL ao desmontar (não vaza memória)', async () => {
    stubFetch(() =>
      new Response(new Blob(['v'], { type: 'video/webm' }), { status: 200 }),
    );

    const { container, unmount } = render(
      <RecordingPlayer downloadUrl={`${API_BASE}/api/v1/remote-sessions/${AGENT}/${SESSION}/recording/download`} />,
    );
    await waitFor(() => expect(container.querySelector('video')).toBeTruthy());

    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });
});

describe('C2(B) — useRecording monta a URL COM sessionId', () => {
  beforeEach(() => {
    configureApiClient({
      getAccessToken: () => 'jwt-de-teste',
      refreshAccessToken: async () => null,
      onAuthFailure: () => {},
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('a chamada de metadados inclui agentId E sessionId (rota real do controller)', async () => {
    const calls = stubFetch((url) => {
      if (url.includes('/recording/download')) {
        // Metadados: a API devolve a URL do conteúdo.
        return jsonResponse({ downloadUrl: '/api/v1/recordings/abc', containerFormat: 'webm', bytes: 10, durationSec: 1 });
      }
      // O download em si devolve o blob.
      return new Response(new Blob(['bytes'], { type: 'video/webm' }), { status: 200 });
    });

    const blob = await fetchRecordingBlob(AGENT, SESSION);
    expect(blob.size).toBeGreaterThan(0);

    const urlPath = calls.find((u) => u.includes('/recording/download'));
    expect(urlPath).toBeTruthy();
    // O DEFEITO (B): a URL antiga omitia o sessionId.
    expect(urlPath).toContain(AGENT);
    expect(urlPath).toContain(SESSION);
    // E não pode haver o padrão quebrado agentId/recording/download.
    expect(urlPath).not.toMatch(new RegExp(`${AGENT}/recording/download$`));
  });

  it('não envia Bearer para URL pré-assinada de storage externo', async () => {
    const seen: Array<{ url: string; auth: string | null }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        seen.push({ url: String(url), auth: new Headers(init?.headers).get('Authorization') });
        if (String(url).includes('/recording/download')) {
          return jsonResponse({
            downloadUrl: 'https://storage.externo.example.com/gravacao.webm?sig=abc',
            containerFormat: 'webm',
            bytes: 10,
            durationSec: 1,
          });
        }
        return new Response(new Blob(['bytes'], { type: 'video/webm' }), { status: 200 });
      }),
    );

    await fetchRecordingBlob(AGENT, SESSION);

    const external = seen.find((c) => c.url.startsWith('https://storage.externo'));
    expect(external).toBeTruthy();
    // O token NÃO pode vazar para outro host — a URL já carrega a assinatura.
    expect(external!.auth).toBeNull();
  });

  it('describeError distingue 401, 403, 404 e rede', () => {
    expect(describeError(new ApiError(401, 'x'), 'fb')).toMatch(/Sessão expirada/);
    expect(describeError(new ApiError(403, 'x'), 'fb')).toMatch(/Sem permissão/);
    expect(describeError(new ApiError(404, 'x'), 'fb')).toMatch(/não encontrada/);
    expect(describeError(new TypeError('Failed to fetch'), 'fb')).toMatch(/Falha de rede/);
  });
});
