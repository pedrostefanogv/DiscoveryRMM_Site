import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TerminalErrorInfo, TerminalReadyInfo } from './useTerminalStream';
import { chunkUtf8, useTerminalStream } from './useTerminalStream';

/**
 * WebSocket falso: o hook fala o protocolo NATS cru (INFO/CONNECT/+OK/MSG), então
 * os testes simulam o servidor linha a linha em vez de mockar o cliente NATS.
 */
class FakeWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    static instances: FakeWebSocket[] = [];

    readyState = FakeWebSocket.CONNECTING;
    binaryType = '';
    sent: string[] = [];
    onopen: (() => void) | null = null;
    onmessage: ((event: { data: ArrayBuffer | Uint8Array | string }) => void) | null = null;
    onerror: (() => void) | null = null;
    onclose: (() => void) | null = null;

    constructor(public url: string) {
        FakeWebSocket.instances.push(this);
    }

    send(data: string | Uint8Array) {
        this.sent.push(typeof data === 'string' ? data : new TextDecoder().decode(data));
    }

    close() {
        this.readyState = FakeWebSocket.CLOSED;
        this.onclose?.();
    }

    /** Injeta bytes crus do protocolo NATS (usado também nos testes de limite). */
    emitRaw(text: string) {
        // Uint8Array (view) — o hook aceita string/ArrayBuffer/views.
        this.onmessage?.({ data: new TextEncoder().encode(text) });
    }

    /** INFO + +OK: handshake completo do NATS. */
    completeHandshake() {
        this.readyState = FakeWebSocket.OPEN;
        this.emitRaw('INFO {"headers":true}\r\n');
        this.emitRaw('+OK\r\n');
    }

    /** Entrega um MSG do NATS (subject + payload JSON). */
    emitMessage(subject: string, payload: unknown) {
        const body = JSON.stringify(payload);
        const len = new TextEncoder().encode(body).length;
        this.emitRaw(`MSG ${subject} 1 ${len}\r\n${body}\r\n`);
    }
}

const NATS_SUBJECT = 'tenant.c1.site.s1.agent.a1.remote.session.sess-1';
const SUBJ = NATS_SUBJECT.replace(/-/g, '');
const TERM_OUT = `${SUBJ}.term.out`;
const TERM_IN = `${SUBJ}.term.in`;
const EVENT = `${SUBJ}.event`;

function lastSocket(): FakeWebSocket {
    return FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
}

function pubs(socket: FakeWebSocket, subject: string): string[] {
    return socket.sent.filter((m) => m.startsWith(`PUB ${subject} `));
}

/** Extrai o JSON do corpo de um frame PUB. */
function pubBody(frame: string): Record<string, unknown> {
    const start = frame.indexOf('\r\n') + 2;
    const end = frame.lastIndexOf('\r\n');
    return JSON.parse(frame.slice(start, end));
}

function decodeBase64Utf8(b64: string): string {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
}

function renderTerminal(overrides: Partial<Parameters<typeof useTerminalStream>[0]> = {}) {
    const onError = vi.fn<(info: TerminalErrorInfo) => void>();
    const onReset = vi.fn<() => void>();
    const onExit = vi.fn<(reason: string) => void>();
    const onReady = vi.fn<(info: TerminalReadyInfo) => void>();
    const onOutput = vi.fn<(data: string) => void>();
    const utils = renderHook(() =>
        useTerminalStream({
            natsSubject: NATS_SUBJECT,
            natsUrl: 'wss://nats.example/nats',
            jwt: 'jwt-1',
            nkeySeed: '',
            ...overrides,
        }),
    );
    act(() => {
        utils.result.current.onError(onError);
        utils.result.current.onReset(onReset);
        utils.result.current.onExit(onExit);
        utils.result.current.onReady(onReady);
        utils.result.current.onOutput(onOutput);
    });
    return { ...utils, onError, onReset, onExit, onReady, onOutput };
}

beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

describe('chunkUtf8', () => {
    it('devolve o texto inteiro quando cabe no limite', () => {
        expect(chunkUtf8('dir', 1024)).toEqual(['dir']);
    });

    it('fatia por bytes sem quebrar runa UTF-8', () => {
        // Cada 'ã' ocupa 2 bytes: 10 bytes = 5 caracteres.
        const input = 'ã'.repeat(10);
        const parts = chunkUtf8(input, 4);
        expect(parts.length).toBeGreaterThan(1);
        for (const part of parts) {
            expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(4);
            // Nenhum U+FFFD (runa quebrada).
            expect(part).not.toContain('\uFFFD');
        }
        expect(parts.join('')).toBe(input);
    });

    it('mantém emoji fora do BMP inteiro no mesmo pedaço', () => {
        const parts = chunkUtf8('🚀🚀🚀', 4);
        expect(parts.join('')).toBe('🚀🚀🚀');
        for (const part of parts) expect(part).not.toContain('\uFFFD');
    });
});

describe('useTerminalStream — handshake e ready', () => {
    it('envia hello com lastSeq -1 no +OK (cobre a corrida do term.ready)', () => {
        const { result } = renderTerminal();
        const socket = lastSocket();

        act(() => {
            result.current.sendResize(120, 40);
        });
        act(() => {
            socket.completeHandshake();
        });

        const helloFrames = pubs(socket, TERM_IN).filter((m) => m.includes('"hello":true'));
        expect(helloFrames).toHaveLength(1);
        const hello = pubBody(helloFrames[0]);
        expect(hello.lastSeq).toBe(-1);
        expect(hello.cols).toBe(120);
        expect(hello.rows).toBe(40);
        // Assina o canal de erro da sessão (.event) além de term.out/term.ready.
        expect(socket.sent.some((m) => m.startsWith(`SUB ${TERM_OUT} `))).toBe(true);
        expect(socket.sent.some((m) => m.startsWith(`SUB ${EVENT} `))).toBe(true);
    });

    it('reporta term.ready recebido em term.out', () => {
        const { result, onReady } = renderTerminal();
        const socket = lastSocket();
        act(() => {
            socket.completeHandshake();
        });
        act(() => {
            socket.emitMessage(TERM_OUT, { shells: ['powershell', 'cmd'], termCols: 120, termRows: 40, backend: 'conpty' });
        });
        expect(onReady).toHaveBeenCalledWith(expect.objectContaining({ shells: ['powershell', 'cmd'], backend: 'conpty' }));
        expect(result.current.isConnected).toBe(true);
    });
});

describe('useTerminalStream — input', () => {
    it('enfileira input antes da autenticação e drena no +OK', () => {
        const { result } = renderTerminal();
        const socket = lastSocket();

        act(() => {
            result.current.sendData('x');
        });
        expect(pubs(socket, TERM_IN).some((m) => m.includes('"data":"eA=="'))).toBe(false);

        act(() => {
            socket.completeHandshake();
        });
        const inputs = pubs(socket, TERM_IN).filter((m) => m.includes('"data"'));
        expect(inputs.some((m) => pubBody(m).data === 'eA==')).toBe(true);
    });

    it('fatia paste grande em vários PUBs reconstruíveis', () => {
        const { result } = renderTerminal();
        const socket = lastSocket();
        act(() => {
            socket.completeHandshake();
        });

        const before = socket.sent.length;
        const big = 'ã'.repeat(20_000); // 40 KB de UTF-8
        act(() => {
            result.current.sendData(big);
        });

        const inputs = pubs(socket, TERM_IN)
            .filter((m) => m.includes('"data"'))
            .slice(0, socket.sent.length - before);
        expect(inputs.length).toBeGreaterThan(1);
        // Nenhum PUB acima do teto de base64 aceito pelo agente (32 KB).
        for (const frame of inputs) {
            const len = Number.parseInt(frame.split(' ')[2] ?? '0', 10);
            expect(len).toBeLessThan(32 * 1024);
        }
        const rebuilt = inputs.map((m) => decodeBase64Utf8(String(pubBody(m).data))).join('');
        expect(rebuilt).toBe(big);
    });
});

describe('useTerminalStream — erros e reset', () => {
    it('não envia paste parcial quando o input offline não cabe na fila', () => {
        const { result, onError } = renderTerminal();
        const socket = lastSocket();
        // ~900 KB de UTF-8 → ~1,2 MB em base64 (> teto de 1 MB da fila).
        act(() => {
            result.current.sendData('a'.repeat(900_000));
        });
        expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'input_queue_full' }));

        act(() => {
            socket.completeHandshake();
        });
        // Nada do paste parcial pode ter ido ao shell.
        expect(pubs(socket, TERM_IN).some((m) => m.includes('"data"'))).toBe(false);
    });

    it('reporta erro publicado pelo agente em term.out', () => {
        const { onError } = renderTerminal();
        const socket = lastSocket();
        act(() => {
            socket.completeHandshake();
        });
        act(() => {
            socket.emitMessage(TERM_OUT, { error: true, code: 'terminal_start_failed', reason: 'sem shell' });
        });
        expect(onError).toHaveBeenCalledWith({ code: 'terminal_start_failed', reason: 'sem shell' });
    });

    it('reporta erro da sessão pelo canal .event (antes sem assinante)', () => {
        const { onError } = renderTerminal();
        const socket = lastSocket();
        act(() => {
            socket.completeHandshake();
        });
        act(() => {
            socket.emitMessage(EVENT, { eventType: 'error', data: { scope: 'terminal', error: 'falha ao iniciar' } });
        });
        expect(onError).toHaveBeenCalledWith({ code: 'session_error', reason: 'falha ao iniciar' });
    });

    it('reset limpa o buffer SEM adotar o seq do agente (não pula frame)', async () => {
        vi.useFakeTimers();
        const { onReset } = renderTerminal();
        const socket = lastSocket();
        act(() => {
            socket.completeHandshake();
        });
        act(() => {
            socket.emitMessage(TERM_OUT, { data: 'eA==', seq: 7 });
        });
        act(() => {
            socket.emitMessage(TERM_OUT, { reset: true, requestedFrom: 7 });
        });
        expect(onReset).toHaveBeenCalledTimes(1);

        // Reconecta: o hello deve pedir replay a partir do seq que o viewer
        // RECEBEU (7). Adotar outro seq pularia um frame nunca recebido.
        act(() => {
            socket.close();
        });
        await act(async () => {
            await vi.advanceTimersByTimeAsync(1100);
        });
        const next = lastSocket();
        act(() => {
            next.completeHandshake();
        });
        const hello = pubs(next, TERM_IN).find((m) => m.includes('"hello":true'));
        expect(pubBody(hello!).lastSeq).toBe(7);
    });

    it('encerra a conexão se o buffer do protocolo NATS estourar', () => {
        const { onError } = renderTerminal();
        const socket = lastSocket();
        act(() => {
            socket.completeHandshake();
        });
        act(() => {
            // Tamanho anunciado absurdo: o parser esperaria o corpo para sempre.
            socket.emitRaw(`MSG ${TERM_OUT} 1 99999999\r\n`);
        });
        act(() => {
            socket.emitRaw('A'.repeat(4 * 1024 * 1024 + 16));
        });
        expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'protocol_overflow' }));
        expect(socket.readyState).toBe(FakeWebSocket.CLOSED);
    });

    it('atualiza lastSeq e pede replay do que faltou no reconnect', async () => {
        vi.useFakeTimers();
        renderTerminal();
        const socket = lastSocket();
        act(() => {
            socket.completeHandshake();
        });
        act(() => {
            socket.emitMessage(TERM_OUT, { data: 'eA==', seq: 7 });
        });
        // Simula queda + reconexão: novo socket recebe o hello com lastSeq=7.
        act(() => {
            socket.close();
        });
        await act(async () => {
            await vi.advanceTimersByTimeAsync(1100);
        });
        const next = lastSocket();
        expect(next).not.toBe(socket);
        act(() => {
            next.completeHandshake();
        });
        const hello = pubs(next, TERM_IN).find((m) => m.includes('"hello":true'));
        expect(hello).toBeDefined();
        expect(pubBody(hello!).lastSeq).toBe(7);
    });
});

describe('useTerminalStream — reconexão', () => {
    it('renova as credenciais antes de reconectar automaticamente', async () => {
        vi.useFakeTimers();
        const getFreshCredentials = vi.fn().mockResolvedValue('jwt-2');
        renderTerminal({ getFreshCredentials });
        const first = lastSocket();
        act(() => {
            first.completeHandshake();
        });
        act(() => {
            first.close();
        });

        await act(async () => {
            await vi.advanceTimersByTimeAsync(1100);
        });

        expect(getFreshCredentials).toHaveBeenCalledTimes(1);
        const second = lastSocket();
        expect(second).not.toBe(first);
        expect(second.url).toContain('jwt-2');
    });
});
