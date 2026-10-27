import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TerminalErrorInfo, TerminalReadyInfo, TerminalStatsInfo } from './useTerminalStream';
import { chunkUtf8, useTerminalStream } from './useTerminalStream';
import type { CompletionResponse } from './terminalInput';
import { NatsCredentialsResponse } from '@/api/nats';

/**
 * Fake do NatsService: o hook usa o cliente nats.js (api/nats.ts) como
 * transporte. Os testes simulam o ciclo de vida (connect/subscribe/publish/
 * estados) e injetam mensagens entregues aos handlers registrados.
 */
class FakeNatsService {
    static instances: FakeNatsService[] = [];

    url: string;
    connected = false;
    disposed = false;
    forceReconnectCalls = 0;
    preSuppliedCreds: NatsCredentialsResponse | null = null;
    subscribed = new Set<string>();
    handlers = new Map<string, Set<(event: unknown) => void>>();
    published: Array<{ subject: string; data: Record<string, unknown> }> = [];
    stateListeners = new Set<(state: string) => void>();
    authListeners = new Set<() => void>();

    constructor(url: string) {
        this.url = url;
        FakeNatsService.instances.push(this);
    }

    connect() {
        if (this.connected) return Promise.resolve(true);
        this.connected = true;
        this.emit('connected');
        return Promise.resolve(true);
    }

    isConnected() { return this.connected; }

    subscribe(subject: string, handler: (event: unknown) => void) {
        this.subscribed.add(subject);
        if (!this.handlers.has(subject)) this.handlers.set(subject, new Set());
        this.handlers.get(subject)!.add(handler);
        return Promise.resolve(true);
    }

    unsubscribe(subject: string, handler: (event: unknown) => void) {
        this.handlers.get(subject)?.delete(handler);
    }

    publish(subject: string, data: Record<string, unknown>) {
        this.published.push({ subject, data });
        return Promise.resolve();
    }

    onConnectionStateChange(cb: (state: string) => void) {
        this.stateListeners.add(cb);
        return () => { this.stateListeners.delete(cb); };
    }

    onAuthError(cb: () => void) {
        this.authListeners.add(cb);
        return () => { this.authListeners.delete(cb); };
    }

    setPreSuppliedCredentials(creds: NatsCredentialsResponse) {
        this.preSuppliedCreds = creds;
    }

    forceReconnect() {
        this.forceReconnectCalls += 1;
        this.connected = true;
        this.emit('connected');
        return Promise.resolve(true);
    }

    dispose() { return Promise.resolve(); }

    // ── helpers de teste ──
    emit(state: string) {
        this.stateListeners.forEach(cb => cb(state));
    }

    authError() {
        this.authListeners.forEach(cb => cb());
    }

    emitMessage(subject: string, payload: unknown) {
        const handlers = this.handlers.get(subject) ?? new Set();
        handlers.forEach(cb => cb(JSON.parse(JSON.stringify(payload))));
    }

    pubs(subject: string) {
        return this.published.filter((p) => p.subject === subject);
    }
}

vi.mock('@/api/nats', () => ({
    createNatsService: (config: { url: string }) => new FakeNatsService(config.url),
}));

const NATS_SUBJECT = 'tenant.c1.site.s1.agent.a1.remote.session.sess-1';
const SUBJ = NATS_SUBJECT.replace(/-/g, '');
const TERM_OUT = `${SUBJ}.term.out`;
const TERM_IN = `${SUBJ}.term.in`;
const EVENT = `${SUBJ}.event`;
const STATS = `${SUBJ}.stats`;
const COMPLETION_REQ = `${SUBJ}.completion.req`;
const COMPLETION_RES = `${SUBJ}.completion.res`;

function lastService(): FakeNatsService {
    return FakeNatsService.instances[FakeNatsService.instances.length - 1];
}

function decodeBase64Utf8(b64: string): string {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
}

type StreamProps = Parameters<typeof useTerminalStream>[0];

const BASE_PROPS: StreamProps = {
    natsSubject: NATS_SUBJECT,
    natsUrl: 'wss://nats.example/nats',
    jwt: 'jwt-1',
    reconnectToken: 0,
};

function renderTerminal(overrides: Partial<StreamProps> = {}) {
    const onError = vi.fn<(info: TerminalErrorInfo) => void>();
    const onReset = vi.fn<() => void>();
    const onExit = vi.fn<(reason: string) => void>();
    const onReady = vi.fn<(info: TerminalReadyInfo) => void>();
    const onOutput = vi.fn<(data: string) => void>();
    const onStats = vi.fn<(info: TerminalStatsInfo) => void>();
    const onCompletion = vi.fn<(res: CompletionResponse) => void>();
    const utils = renderHook((props: StreamProps) => useTerminalStream(props), {
        initialProps: { ...BASE_PROPS, ...overrides },
    });
    act(() => {
        utils.result.current.onError(onError);
        utils.result.current.onReset(onReset);
        utils.result.current.onExit(onExit);
        utils.result.current.onReady(onReady);
        utils.result.current.onOutput(onOutput);
        utils.result.current.onStats(onStats);
        utils.result.current.onCompletion(onCompletion);
    });
    return { ...utils, onError, onReset, onExit, onReady, onOutput, onStats, onCompletion };
}

function hellos(service: FakeNatsService) {
    return service.pubs(TERM_IN).filter((p) => p.data.hello === true);
}

beforeEach(() => {
    FakeNatsService.instances = [];
});

afterEach(() => {
    vi.useRealTimers();
});
describe('chunkUtf8', () => {
    it('devolve o texto inteiro quando cabe no limite', () => {
        expect(chunkUtf8('dir', 1024)).toEqual(['dir']);
    });

    it('fatia por bytes sem quebrar runa UTF-8', () => {
        const input = 'ã'.repeat(10);
        const parts = chunkUtf8(input, 4);
        expect(parts.length).toBeGreaterThan(1);
        for (const part of parts) {
            expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(4);
            expect(part).not.toContain('\uFFFD');
        }
        expect(parts.join('')).toBe(input);
    });

    it('mantém emoji fora do BMP inteiro no mesmo pedaço', () => {
        const parts = chunkUtf8('🚀🚀🚀', 4);
        expect(parts).toHaveLength(3);
    });
});

describe('useTerminalStream — handshake e ready', () => {
    it('envia hello com lastSeq -1 ao conectar (cobre a corrida do term.ready)', () => {
        const { result } = renderTerminal();
        const service = lastService();

        act(() => {
            result.current.sendResize(120, 40);
        });
        act(() => {
            void service.connect();
        });

        const helloFrames = hellos(service);
        expect(helloFrames).toHaveLength(1);
        expect(helloFrames[0].data.lastSeq).toBe(-1);
        // O resize acontece DEPOIS do connect (o hook conecta no mount): vai
        // como mensagem própria de term.in, não embutida no hello.
        const resizes = service.pubs(TERM_IN).filter((p) => p.data.cols === 120);
        expect(resizes).toHaveLength(1);
        expect(resizes[0].data.rows).toBe(40);
        // Assina term.out/term.ready/stats/event/completion.res.
        expect(service.subscribed.has(TERM_OUT)).toBe(true);
        expect(service.subscribed.has(EVENT)).toBe(true);
    });

    it('reporta term.ready recebido em term.out', () => {
        const { result, onReady } = renderTerminal();
        const service = lastService();
        act(() => {
            void service.connect();
        });
        act(() => {
            service.emitMessage(TERM_OUT, { shells: ['powershell', 'cmd'], termCols: 120, termRows: 40, backend: 'conpty' });
        });
        expect(onReady).toHaveBeenCalledWith(expect.objectContaining({ shells: ['powershell', 'cmd'], backend: 'conpty' }));
        expect(result.current.isConnected).toBe(true);
    });

    it('term.ready SEM capabilities não quebra (agente antigo)', () => {
        const { onReady } = renderTerminal();
        const service = lastService();
        act(() => {
            void service.connect();
        });
        act(() => {
            service.emitMessage(TERM_OUT, { shells: ['cmd'], termCols: 80, termRows: 24 });
        });
        expect(onReady).toHaveBeenCalledTimes(1);
        const info = onReady.mock.calls[0][0] as TerminalReadyInfo;
        expect(info.supportsCompletionQuery).toBeUndefined();
        expect(info.capabilitiesVersion).toBeUndefined();
        expect(info.backend).toBeUndefined();
    });

    it('propaga os campos ADITIVOS do contrato v3 no term.ready', () => {
        const { onReady } = renderTerminal();
        const service = lastService();
        act(() => {
            void service.connect();
        });
        act(() => {
            service.emitMessage(TERM_OUT, {
                shells: ['powershell', 'cmd', 'bash'],
                consoleId: 'c1',
                termCols: 120,
                termRows: 40,
                backend: 'conpty',
                shellPath: 'C:\\pwsh.exe',
                capabilitiesVersion: 1,
                shellKind: 'powershell',
                supportsVt: true,
                supportsResize: true,
                supportsCompletionQuery: true,
                encoding: 'utf-8',
            });
        });
        expect(onReady).toHaveBeenCalledWith(expect.objectContaining({
            capabilitiesVersion: 1,
            shellKind: 'powershell',
            supportsCompletionQuery: true,
            supportsVt: true,
            supportsResize: true,
            encoding: 'utf-8',
        }));
    });
});

describe('useTerminalStream — contrato v3 (stats/completions)', () => {
    it('assina stats e completion.res e publica completion.req', () => {
        const { result } = renderTerminal();
        const service = lastService();
        act(() => {
            void service.connect();
        });
        expect(service.subscribed.has(STATS)).toBe(true);
        expect(service.subscribed.has(COMPLETION_RES)).toBe(true);

        act(() => {
            result.current.sendCompletionRequest({
                reqId: 'r1',
                input: 'Get-Ch',
                cursor: 6,
                forward: null,
                page: 0,
                pageSize: 50,
            });
        });
        const frames = service.pubs(COMPLETION_REQ);
        expect(frames).toHaveLength(1);
        expect(frames[0].data).toMatchObject({ reqId: 'r1', input: 'Get-Ch', cursor: 6, forward: null, page: 0, pageSize: 50 });
    });

    it('entrega os contadores do subject stats', () => {
        const { onStats } = renderTerminal();
        const service = lastService();
        act(() => {
            void service.connect();
        });
        act(() => {
            service.emitMessage(STATS, {
                sessionId: 'sess-1',
                framesOut: 12,
                bytesOut: 4096,
                inputRejected: 1,
                flushHolds: 2,
                publishErrors: 0,
                replayResets: 3,
                uptimeMs: 65000,
            });
        });
        expect(onStats).toHaveBeenCalledWith(expect.objectContaining({ framesOut: 12, bytesOut: 4096, replayResets: 3 }));
    });

    it('entrega completion.res normalizado para o viewer', () => {
        const { onCompletion } = renderTerminal();
        const service = lastService();
        act(() => {
            void service.connect();
        });
        act(() => {
            service.emitMessage(COMPLETION_RES, {
                reqId: 'r9',
                ok: true,
                replacementIndex: 2,
                replacementLength: 4,
                matches: [{ insert: 'Get-ChildItem' }],
                totalCount: 1,
                page: 0,
                pageSize: 50,
                hasMore: false,
            });
        });
        expect(onCompletion).toHaveBeenCalledWith(expect.objectContaining({ reqId: 'r9', ok: true, totalCount: 1 }));
    });
});
describe('useTerminalStream — input', () => {
    it('enfileira input antes da conexão e drena no connected', () => {
        const { result } = renderTerminal();
        const service = lastService();
        // Cai: o input passa a ser enfileirado até a reconexão.
        act(() => {
            service.connected = false;
            service.emit('disconnected');
        });

        act(() => {
            result.current.sendData('x');
        });
        expect(service.pubs(TERM_IN).some((p) => p.data.data === 'eA==')).toBe(false);

        act(() => {
            void service.connect();
        });
        const inputs = service.pubs(TERM_IN).filter((p) => typeof p.data.data === 'string');
        expect(inputs.some((p) => p.data.data === 'eA==')).toBe(true);
    });

    it('fatia paste grande em vários publishes reconstruíveis', () => {
        const { result } = renderTerminal();
        const service = lastService();
        act(() => {
            void service.connect();
        });

        const big = 'ã'.repeat(20_000); // 40 KB de UTF-8
        act(() => {
            result.current.sendData(big);
        });

        const inputs = service.pubs(TERM_IN).filter((p) => typeof p.data.data === 'string');
        expect(inputs.length).toBeGreaterThan(1);
        // Nenhum payload acima do teto de base64 aceito pelo agente (32 KB).
        for (const p of inputs) {
            expect(new TextEncoder().encode(String(p.data.data)).length).toBeLessThan(32 * 1024);
        }
        const rebuilt = inputs.map((p) => decodeBase64Utf8(String(p.data.data))).join('');
        expect(rebuilt).toBe(big);
    });
});

describe('useTerminalStream — erros e reset', () => {
    it('não envia paste parcial quando o input offline não cabe na fila', () => {
        const { result, onError } = renderTerminal();
        const service = lastService();
        act(() => {
            service.connected = false;
            service.emit('disconnected');
        });
        // ~900 KB de UTF-8 → ~1,2 MB em base64 (> teto de 1 MB da fila).
        act(() => {
            result.current.sendData('a'.repeat(900_000));
        });
        expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'input_queue_full' }));

        act(() => {
            void service.connect();
        });
        // Nada do paste parcial pode ter ido ao shell.
        expect(service.pubs(TERM_IN).some((p) => typeof p.data.data === 'string')).toBe(false);
    });

    it('reporta erro publicado pelo agente em term.out', () => {
        const { onError } = renderTerminal();
        const service = lastService();
        act(() => {
            void service.connect();
        });
        act(() => {
            service.emitMessage(TERM_OUT, { error: true, code: 'terminal_start_failed', reason: 'sem shell' });
        });
        expect(onError).toHaveBeenCalledWith({ code: 'terminal_start_failed', reason: 'sem shell' });
    });

    it('reporta erro da sessão pelo canal .event (antes sem assinante)', () => {
        const { onError } = renderTerminal();
        const service = lastService();
        act(() => {
            void service.connect();
        });
        act(() => {
            service.emitMessage(EVENT, { eventType: 'error', data: { scope: 'terminal', error: 'falha ao iniciar' } });
        });
        expect(onError).toHaveBeenCalledWith({ code: 'session_error', reason: 'falha ao iniciar' });
    });

    it('reset limpa o buffer SEM adotar o seq do agente (não pula frame)', () => {
        const { onReset } = renderTerminal();
        const service = lastService();
        act(() => {
            void service.connect();
        });
        act(() => {
            service.emitMessage(TERM_OUT, { data: 'eA==', seq: 7 });
        });
        act(() => {
            service.emitMessage(TERM_OUT, { reset: true, requestedFrom: 7 });
        });
        expect(onReset).toHaveBeenCalledTimes(1);

        // Reconecta: o hello deve pedir replay a partir do seq que o viewer
        // RECEBEU (7). Adotar outro seq pularia um frame nunca recebido.
        act(() => {
            service.connected = false;
            service.emit('disconnected');
        });
        act(() => {
            service.forceReconnect();
        });
        const hello = hellos(service).at(-1);
        expect(hello!.data.lastSeq).toBe(7);
    });

    it('atualiza lastSeq e pede replay do que faltou no reconnect', () => {
        renderTerminal();
        const service = lastService();
        act(() => {
            void service.connect();
        });
        act(() => {
            service.emitMessage(TERM_OUT, { data: 'eA==', seq: 7 });
        });
        // Simula queda + reconexão: o hello do reconnect usa o lastSeq visto.
        act(() => {
            service.connected = false;
            service.emit('disconnected');
        });
        act(() => {
            service.forceReconnect();
        });
        const hello = hellos(service).at(-1);
        expect(hello).toBeDefined();
        expect(hello!.data.lastSeq).toBe(7);
    });
});

describe('useTerminalStream — reconexão imperativa (R4)', () => {
    it('reconecta no MESMO componente preservando o lastSeq do replay', () => {
        const { rerender, result } = renderTerminal();
        const first = lastService();
        act(() => {
            void first.connect();
        });
        act(() => {
            first.emitMessage(TERM_OUT, { data: btoa('x'), seq: 9 });
        });

        // Botão "Reconectar": a página incrementa o token (sem trocar a key).
        act(() => {
            rerender({ ...BASE_PROPS, reconnectToken: 1 });
        });
        const second = lastService();
        expect(second).toBe(first);
        expect(result.current.isConnected).toBe(true);

        // O hello pede replay a partir do seq JÁ visto: com o componente
        // preservado (scrollback intacto) o agente reenvia só a lacuna.
        const hello = hellos(second).at(-1);
        expect(hello).toBeDefined();
        expect(hello!.data.lastSeq).toBe(9);
    });

    it('ignora resize 0x0 (aba inativa/container oculto)', () => {
        const { result } = renderTerminal();
        const service = lastService();
        act(() => {
            result.current.sendResize(0, 0);
        });
        act(() => {
            void service.connect();
        });
        const hello = hellos(service).at(-1);
        expect(hello).toBeDefined();
        // Sem dimensões válidas o hello vai sem cols/rows (o agente trata como
        // handshake puro e não redimensiona para 0).
        expect(hello!.data.cols).toBeUndefined();
        expect(hello!.data.rows).toBeUndefined();
        expect(service.pubs(TERM_IN).some((p) => p.data.cols === 0)).toBe(false);
    });

    it('não reconecta quando o token não muda', () => {
        const { rerender } = renderTerminal();
        const first = lastService();
        act(() => {
            void first.connect();
        });
        act(() => {
            rerender({ ...BASE_PROPS, reconnectToken: 0 });
        });
        expect(first.forceReconnectCalls).toBe(0);
    });
});

describe('useTerminalStream — renovação de credenciais (auth)', () => {
    it('busca credencial fresca e reconecta em auth_error', async () => {
        const getFreshCredentials = vi.fn().mockResolvedValue('jwt-2');
        renderTerminal({ getFreshCredentials });
        const service = lastService();
        act(() => {
            void service.connect();
        });

        act(() => {
            service.authError();
        });

        await act(async () => {});
        expect(getFreshCredentials).toHaveBeenCalledTimes(1);
        expect(service.forceReconnectCalls).toBe(1);
        // A credencial pré-fornecida mais recente é o JWT fresco.
        expect(service.preSuppliedCreds?.jwt).toBe('jwt-2');
    });
});
