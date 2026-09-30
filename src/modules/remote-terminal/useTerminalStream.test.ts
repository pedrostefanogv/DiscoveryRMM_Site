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

type StreamProps = Parameters<typeof useTerminalStream>[0];

const BASE_PROPS: StreamProps = {
    natsSubject: NATS_SUBJECT,
    natsUrl: 'wss://nats.example/nats',
    jwt: 'jwt-1',
    nkeySeed: '',
    reconnectToken: 0,
};

function renderTerminal(overrides: Partial<StreamProps> = {}) {
    const onError = vi.fn<(info: TerminalErrorInfo) => void>();
    const onReset = vi.fn<() => void>();
    const onExit = vi.fn<(reason: string) => void>();
    const onReady = vi.fn<(info: TerminalReadyInfo) => void>();
    const onOutput = vi.fn<(data: string) => void>();
    // initialProps permitem trocar natsUrl/subj e reexecutar o efeito NO MESMO
    // componente — exatamente o que o StrictMode (e uma troca de props) faz.
    const utils = renderHook((props: StreamProps) => useTerminalStream(props), {
        initialProps: { ...BASE_PROPS, ...overrides },
    });
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

describe('useTerminalStream — reconexão imperativa (R4)', () => {
    it('reconecta no MESMO componente preservando o lastSeq do replay', () => {
        const { rerender, result } = renderTerminal();
        const first = lastSocket();
        act(() => {
            first.completeHandshake();
        });
        act(() => {
            first.emitMessage(TERM_OUT, { data: btoa('x'), seq: 9 });
        });

        // Botão "Reconectar": a página incrementa o token (sem trocar a key).
        act(() => {
            rerender({ ...BASE_PROPS, reconnectToken: 1 });
        });
        const second = lastSocket();
        expect(second).not.toBe(first);
        act(() => {
            second.completeHandshake();
        });
        expect(result.current.isConnected).toBe(true);

        // O hello pede replay a partir do seq JÁ visto: com o componente
        // preservado (scrollback intacto) o agente reenvia só a lacuna, em vez
        // de mandar o anel inteiro (comportamento da remontagem antiga).
        const hello = pubs(second, TERM_IN).find((m) => m.includes('"hello":true'));
        expect(hello).toBeDefined();
        expect(pubBody(hello!).lastSeq).toBe(9);
    });

    it('ignora resize 0x0 (aba inativa/container oculto)', () => {
        const { result } = renderTerminal();
        const socket = lastSocket();
        act(() => {
            result.current.sendResize(0, 0);
        });
        act(() => {
            socket.completeHandshake();
        });
        const hello = pubs(socket, TERM_IN).find((m) => m.includes('"hello":true'));
        expect(hello).toBeDefined();
        // Sem dimensões válidas o hello vai sem cols/rows (o agente trata como
        // handshake puro e não redimensiona para 0).
        expect(pubBody(hello!).cols).toBeUndefined();
        expect(pubBody(hello!).rows).toBeUndefined();
        expect(pubs(socket, TERM_IN).some((m) => m.includes('"cols":0'))).toBe(false);
    });

    it('não reconecta quando o token não muda', () => {
        const { rerender } = renderTerminal();
        const first = lastSocket();
        act(() => {
            first.completeHandshake();
        });
        act(() => {
            rerender({ ...BASE_PROPS, reconnectToken: 0 });
        });
        expect(lastSocket()).toBe(first);
    });
});

describe('useTerminalStream — protocolo fatiado', () => {
    it('remonta um payload MSG dividido em vários eventos do WebSocket', () => {
        const { onOutput } = renderTerminal();
        const socket = lastSocket();
        act(() => {
            socket.completeHandshake();
        });

        const body = JSON.stringify({ data: btoa('fatiado'), seq: 3 });
        const len = new TextEncoder().encode(body).length;
        const frame = `MSG ${TERM_OUT} 1 ${len}\r\n${body}\r\n`;
        // Três pedaços: header + metade do corpo, resto do corpo, CRLF final.
        const cut1 = frame.indexOf('\r\n') + 2 + 5;
        const cut2 = frame.length - 3;
        act(() => { socket.emitRaw(frame.slice(0, cut1)); });
        expect(onOutput).not.toHaveBeenCalled();
        act(() => { socket.emitRaw(frame.slice(cut1, cut2)); });
        act(() => { socket.emitRaw(frame.slice(cut2)); });

        expect(onOutput).toHaveBeenCalledWith('fatiado');
    });

    it('processa duas mensagens MSG coladas no mesmo evento', () => {
        const { onOutput } = renderTerminal();
        const socket = lastSocket();
        act(() => {
            socket.completeHandshake();
        });
        const frame = (text: string, seq: number) => {
            const body = JSON.stringify({ data: btoa(text), seq });
            const len = new TextEncoder().encode(body).length;
            return `MSG ${TERM_OUT} 1 ${len}\r\n${body}\r\n`;
        };
        act(() => { socket.emitRaw(frame('um', 1) + frame('dois', 2)); });
        expect(onOutput).toHaveBeenCalledWith('um');
        expect(onOutput).toHaveBeenCalledWith('dois');
    });
});

describe('useTerminalStream — socket obsoleto', () => {
    it('não deixa o evento tardio do socket ANTIGO derrubar a conexão nova', () => {
        const { rerender, result } = renderTerminal();
        const first = lastSocket();
        act(() => {
            first.completeHandshake();
        });
        expect(result.current.isConnected).toBe(true);

        // Troca a URL no MESMO componente: o efeito refaz a conexão.
        act(() => {
            rerender({ ...BASE_PROPS, natsUrl: 'wss://nats2.example/nats' });
        });
        const second = lastSocket();
        expect(second).not.toBe(first);
        act(() => {
            second.completeHandshake();
        });
        expect(result.current.isConnected).toBe(true);

        // Evento TARDIO do socket antigo (o navegador dispara o close DEPOIS de
        // o novo efeito rodar — StrictMode/remontagem). Sem a guarda de socket
        // obsoleto isto marcava isConnected=false e agendava um reconnect extra,
        // derrubando a conexão saudável.
        act(() => {
            first.onclose?.();
        });
        expect(result.current.isConnected).toBe(true);
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
