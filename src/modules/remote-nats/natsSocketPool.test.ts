import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    POOL_DISPOSE_DEBOUNCE_MS,
    acquire,
    natsPoolSize,
    natsSocketPoolKey,
    onState,
    publish,
    release,
    resetNatsSocketPool,
    sub,
    type NatsSocketConfig,
    type PoolStateEvent,
} from './natsSocketPool';

/**
 * WebSocket falso: o pool fala o protocolo NATS cru (INFO/CONNECT/+OK/MSG),
 * então os testes simulam o servidor linha a linha em vez de mockar um cliente.
 * Os separadores são montados com String.fromCharCode para o fonte não depender
 * de escapes de barra invertida.
 */
const CR = String.fromCharCode(13);
const LF = String.fromCharCode(10);
const CRLF = CR + LF;

class FakeWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    static instances: FakeWebSocket[] = [];

    readyState = FakeWebSocket.CONNECTING;
    binaryType = '';
    sent: string[] = [];
    closedWith: { code?: number; reason?: string } | null = null;
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

    close(code?: number, reason?: string) {
        if (this.readyState === FakeWebSocket.CLOSED) return;
        this.closedWith = { code, reason };
        this.readyState = FakeWebSocket.CLOSED;
        this.onclose?.();
    }

    emitRaw(text: string) {
        this.onmessage?.({ data: new TextEncoder().encode(text) });
    }

    /** INFO + +OK: handshake completo do NATS (CONNECT e autenticação). */
    handshake() {
        this.readyState = FakeWebSocket.OPEN;
        this.emitRaw('INFO {"headers":true}' + CRLF);
        this.emitRaw('+OK' + CRLF);
    }

    emitMessage(subject: string, sid: number, body: string) {
        const len = new TextEncoder().encode(body).length;
        this.emitRaw(`MSG ${subject} ${sid} ${len}` + CRLF + body + CRLF);
    }
}

const NATS_URL = 'wss://nats.example/nats';

function config(overrides: Partial<NatsSocketConfig> = {}): NatsSocketConfig {
    return { url: NATS_URL, jwt: 'jwt-1', ...overrides };
}

function lastSocket(): FakeWebSocket {
    return FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
}

function framesStartingWith(ws: FakeWebSocket, prefix: string): string[] {
    return ws.sent.filter((frame) => frame.startsWith(prefix));
}

function sidOf(ws: FakeWebSocket, subject: string): number {
    const frame = framesStartingWith(ws, `SUB ${subject} `)[0];
    expect(frame).toBeDefined();
    return Number.parseInt(frame.split(' ')[2] ?? '', 10);
}

beforeEach(() => {
    resetNatsSocketPool();
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
});

afterEach(() => {
    resetNatsSocketPool();
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

describe('natsSocketPool — chave e refcount', () => {
    it('abre UM único WebSocket para dois assinantes com as mesmas credenciais', () => {
        const a = acquire(config());
        // Barra final normalizada: a mesma chave do acquire original.
        const b = acquire(config({ url: NATS_URL + '/' }));

        expect(a).toBe(b);
        expect(FakeWebSocket.instances).toHaveLength(1);
        expect(natsPoolSize()).toBe(1);
        expect(a.key).toBe(natsSocketPoolKey(config()));
        expect(a.url).toBe(NATS_URL + '/');

        release(a);
        release(b);
    });

    it('não compartilha conexão entre URL ou credenciais diferentes', () => {
        const a = acquire(config());
        const b = acquire(config({ url: 'wss://outro.example/nats' }));
        const c = acquire(config({ jwt: 'jwt-2' }));

        expect(new Set([a.key, b.key, c.key]).size).toBe(3);
        expect(FakeWebSocket.instances).toHaveLength(3);
        expect(FakeWebSocket.instances.map((ws) => ws.url)).toEqual([
            `${NATS_URL}/?access_token=jwt-1`,
            'wss://outro.example/nats/?access_token=jwt-1',
            `${NATS_URL}/?access_token=jwt-2`,
        ]);

        release(a);
        release(b);
        release(c);
    });

    it('descarta a conexão quando o refcount chega a zero (após o debounce)', async () => {
        vi.useFakeTimers();
        const a = acquire(config());
        const b = acquire(config());
        const ws = lastSocket();
        ws.handshake();

        release(a);
        await vi.advanceTimersByTimeAsync(POOL_DISPOSE_DEBOUNCE_MS + 10);
        // Ainda há um assinante: a conexão continua viva.
        expect(ws.readyState).toBe(FakeWebSocket.OPEN);
        expect(natsPoolSize()).toBe(1);

        release(b);
        await vi.advanceTimersByTimeAsync(POOL_DISPOSE_DEBOUNCE_MS + 10);
        expect(ws.readyState).toBe(FakeWebSocket.CLOSED);
        expect(natsPoolSize()).toBe(0);
    });

    it('reutiliza a conexão quando um novo assinante chega dentro do debounce', async () => {
        vi.useFakeTimers();
        const a = acquire(config());
        const ws = lastSocket();
        ws.handshake();

        release(a);
        const b = acquire(config());
        await vi.advanceTimersByTimeAsync(POOL_DISPOSE_DEBOUNCE_MS + 10);

        expect(FakeWebSocket.instances).toHaveLength(1);
        expect(b.isOpen()).toBe(true);
        release(b);
    });
});

describe('natsSocketPool — assinaturas', () => {
    it('envia SUB uma vez por subject e UNSUB só quando o último handler sai', () => {
        const socket = acquire(config());
        const ws = lastSocket();
        ws.handshake();

        const h1 = vi.fn();
        const h2 = vi.fn();
        const off1 = sub(socket, 'x.term.out', h1);
        const off2 = sub(socket, 'x.term.out', h2);

        expect(framesStartingWith(ws, 'SUB x.term.out ')).toHaveLength(1);
        const sid = sidOf(ws, 'x.term.out');

        off1();
        expect(framesStartingWith(ws, 'UNSUB ')).toHaveLength(0);

        off2();
        off2(); // idempotente
        expect(framesStartingWith(ws, 'UNSUB ')).toEqual([`UNSUB ${sid}`]);

        release(socket);
    });

    it('roteia a MSG para o handler do subject certo (por SID)', () => {
        const socket = acquire(config());
        const ws = lastSocket();
        ws.handshake();

        const out = vi.fn();
        const stats = vi.fn();
        const out2 = vi.fn();
        sub(socket, 'x.term.out', out);
        sub(socket, 'x.term.out', out2);
        sub(socket, 'x.stats', stats);

        ws.emitMessage('x.stats', sidOf(ws, 'x.stats'), '{"framesOut":3}');

        expect(stats).toHaveBeenCalledWith('{"framesOut":3}');
        expect(out).not.toHaveBeenCalled();
        expect(out2).not.toHaveBeenCalled();
    });

    it('entrega payload fatiado em vários eventos do WebSocket', () => {
        const socket = acquire(config());
        const ws = lastSocket();
        ws.handshake();
        const handler = vi.fn();
        sub(socket, 'x.term.out', handler);
        const sid = sidOf(ws, 'x.term.out');

        const body = '{"data":"fatiado"}';
        const len = new TextEncoder().encode(body).length;
        const frame = `MSG x.term.out ${sid} ${len}` + CRLF + body + CRLF;
        const cut = frame.indexOf(CRLF) + 2 + 4;
        ws.emitRaw(frame.slice(0, cut));
        expect(handler).not.toHaveBeenCalled();
        ws.emitRaw(frame.slice(cut));

        expect(handler).toHaveBeenCalledWith(body);
    });

    it('dois handles do MESMO handler no mesmo subject são independentes', () => {
        const socket = acquire(config());
        const ws = lastSocket();
        ws.handshake();

        const handler = vi.fn();
        const off1 = sub(socket, 'x.term.out', handler);
        const off2 = sub(socket, 'x.term.out', handler);
        const sid = sidOf(ws, 'x.term.out');

        // O primeiro handle remove só a SUA assinatura: a outra continua ativa.
        off1();
        expect(framesStartingWith(ws, 'UNSUB ')).toHaveLength(0);
        ws.emitMessage('x.term.out', sid, 'ainda vivo');
        expect(handler).toHaveBeenCalledTimes(1);

        // Só o último handle manda o UNSUB (uma única vez).
        off2();
        expect(framesStartingWith(ws, 'UNSUB ')).toEqual([`UNSUB ${sid}`]);
        ws.emitMessage('x.term.out', sid, 'não deve chegar');
        expect(handler).toHaveBeenCalledTimes(1);

        release(socket);
    });

    it('descarta o UNSUB quando o socket ainda não autenticou (nada vai à rede)', () => {
        const socket = acquire(config());
        const ws = lastSocket();
        const off = sub(socket, 'x.term.out', vi.fn());
        expect(framesStartingWith(ws, 'SUB ')).toHaveLength(0);
        off();
        expect(framesStartingWith(ws, 'UNSUB ')).toHaveLength(0);
        release(socket);
    });
});

describe('natsSocketPool — publish e keepalive', () => {
    it('publica com o framing PUB correto (comprimento em BYTES)', () => {
        const socket = acquire(config());
        const ws = lastSocket();

        // Antes do +OK não há PUB válido: o chamador decide enfileirar.
        expect(publish(socket, 'x.term.in', '{"a":1}')).toBe(false);
        expect(framesStartingWith(ws, 'PUB ')).toHaveLength(0);

        ws.handshake();
        const body = '{"a":"ã"}';
        const len = new TextEncoder().encode(body).length;
        expect(publish(socket, 'x.term.in', body)).toBe(true);
        expect(ws.sent).toContain(`PUB x.term.in ${len}` + CRLF + body + CRLF);
    });

    it('responde PING com PONG', () => {
        const socket = acquire(config());
        const ws = lastSocket();
        ws.handshake();
        ws.emitRaw('PING' + CRLF);
        expect(ws.sent).toContain('PONG');
        release(socket);
    });
});

describe('natsSocketPool — reconexão', () => {
    it('reconecta com backoff e refaz as assinaturas ativas', async () => {
        vi.useFakeTimers();
        const socket = acquire(config());
        const first = lastSocket();
        first.handshake();
        const handler = vi.fn();
        sub(socket, 'x.term.out', handler);
        const sid = sidOf(first, 'x.term.out');

        first.close();

        await vi.advanceTimersByTimeAsync(1100);

        const second = lastSocket();
        expect(second).not.toBe(first);
        expect(FakeWebSocket.instances).toHaveLength(2);
        expect(second.url).toContain('jwt-1');

        second.handshake();
        expect(second.sent).toContain(`SUB x.term.out ${sid}`);

        // O MESMO handler continua recebendo na conexão nova.
        second.emitMessage('x.term.out', sid, 'ok');
        expect(handler).toHaveBeenCalledWith('ok');

        release(socket);
    });

    it('renova as credenciais antes de reconectar automaticamente', async () => {
        vi.useFakeTimers();
        const refresh = vi.fn().mockResolvedValue('jwt-2');
        const socket = acquire(config({ getFreshCredentials: refresh }));
        const first = lastSocket();
        first.handshake();

        first.close();
        await vi.advanceTimersByTimeAsync(1100);

        expect(refresh).toHaveBeenCalledTimes(1);
        const second = lastSocket();
        expect(second).not.toBe(first);
        expect(second.url).toContain('jwt-2');
        release(socket);
    });

    it('não reconecta depois que o refcount chega a zero', async () => {
        vi.useFakeTimers();
        const socket = acquire(config());
        const ws = lastSocket();
        ws.handshake();

        release(socket);
        ws.close();
        await vi.advanceTimersByTimeAsync(2000);

        // Nenhuma tentativa nova: o pool descartou a entrada.
        expect(FakeWebSocket.instances).toHaveLength(1);
        expect(natsPoolSize()).toBe(0);
    });

    it('reconnect manual durante o refresh pendente não deixa socket órfão', async () => {
        vi.useFakeTimers();
        let resolverRefresh: ((jwt: string) => void) | null = null;
        const refresh = () =>
            new Promise<string>((resolve) => {
                resolverRefresh = resolve;
            });
        const socket = acquire(config({
            getFreshCredentials: refresh,
            maxReconnectAttempts: 3,
            reconnectBaseDelayMs: 100,
        }));
        lastSocket().handshake();
        lastSocket().close();

        // Dispara a tentativa automática, que fica aguardando o refresh.
        await vi.advanceTimersByTimeAsync(150);
        expect(resolverRefresh).not.toBeNull();

        // Botão Reconectar no meio do refresh: descarta a geração antiga.
        socket.reconnect();
        const aposManual = FakeWebSocket.instances.length;

        // A tentativa antiga NÃO pode abrir uma segunda conexão ao retomar
        // (antes, o WebSocket do reconnect manual ficava órfão/aberto).
        resolverRefresh!('jwt-2');
        await vi.advanceTimersByTimeAsync(1);

        expect(FakeWebSocket.instances).toHaveLength(aposManual);
        // O que sobrou é a conexão do reconnect manual, autenticável.
        const atual = lastSocket();
        atual.handshake();
        expect(socket.isOpen()).toBe(true);

        release(socket);
    });

    it('desiste após esgotar o orçamento de tentativas (closed fatal)', async () => {
        vi.useFakeTimers();
        const socket = acquire(config({ maxReconnectAttempts: 2, reconnectBaseDelayMs: 100 }));
        const events: PoolStateEvent[] = [];
        onState(socket, (event) => events.push(event));

        lastSocket().handshake();
        lastSocket().close();
        await vi.advanceTimersByTimeAsync(200);
        lastSocket().close();
        await vi.advanceTimersByTimeAsync(400);
        lastSocket().close();
        await vi.advanceTimersByTimeAsync(800);

        expect(events.some((e) => e.state === 'reconnecting')).toBe(true);
        expect(events).toContainEqual({ state: 'closed', reason: 'retries_exhausted', fatal: true });

        // Um reconnect() explícito volta a abrir (é o botão Reconectar).
        const before = FakeWebSocket.instances.length;
        socket.reconnect();
        expect(FakeWebSocket.instances.length).toBe(before + 1);
        release(socket);
    });
});

describe('natsSocketPool — erro de protocolo', () => {
    it('erro de protocolo encerra SÓ aquele socket e notifica os assinantes', () => {
        const a = acquire(config());
        const b = acquire(config({ jwt: 'jwt-2' }));
        const wsA = FakeWebSocket.instances[0];
        const wsB = FakeWebSocket.instances[1];
        const statesA: PoolStateEvent[] = [];
        const statesB: PoolStateEvent[] = [];
        onState(a, (event) => statesA.push(event));
        onState(b, (event) => statesB.push(event));
        wsA.handshake();
        wsB.handshake();

        // Cabeçalho MSG com tamanho não numérico: parser não pode continuar.
        wsA.emitRaw('MSG x.term.out 1 abc' + CRLF);

        expect(wsA.readyState).toBe(FakeWebSocket.CLOSED);
        expect(wsB.readyState).toBe(FakeWebSocket.OPEN);
        expect(statesA).toContainEqual({
            state: 'error',
            error: { code: 'protocol_error', reason: 'MSG x.term.out 1 abc' },
        });
        expect(statesA).toContainEqual({ state: 'closed', reason: 'protocol_error', fatal: true });
        // A outra chave do pool seguiu intacta: só o 'open' dela foi emitido.
        expect(statesB).toEqual([{ state: 'open' }]);

        release(a);
        release(b);
    });

    it('estouro do buffer do protocolo é fatal e reportado', () => {
        const socket = acquire(config());
        const ws = lastSocket();
        ws.handshake();
        const events: PoolStateEvent[] = [];
        onState(socket, (event) => events.push(event));

        ws.emitRaw('MSG x.term.out 1 99999999' + CRLF);
        ws.emitRaw('A'.repeat(4 * 1024 * 1024 + 16));

        expect(events).toContainEqual({
            state: 'error',
            error: { code: 'protocol_overflow', reason: 'Buffer do protocolo NATS acima do limite.' },
        });
        expect(events).toContainEqual({ state: 'closed', reason: 'protocol_overflow', fatal: true });
        expect(ws.readyState).toBe(FakeWebSocket.CLOSED);
        release(socket);
    });

    it('-ERR notifica os assinantes e agenda reconexão (erro recuperável)', async () => {
        vi.useFakeTimers();
        const socket = acquire(config());
        const ws = lastSocket();
        const events: PoolStateEvent[] = [];
        onState(socket, (event) => events.push(event));
        ws.handshake();

        ws.emitRaw("-ERR 'Authorization Violation'" + CRLF);

        expect(events).toContainEqual({
            state: 'error',
            error: { code: 'nats_error', reason: 'Authorization Violation' },
        });
        expect(ws.readyState).toBe(FakeWebSocket.CLOSED);
        expect(events.some((e) => e.state === 'reconnecting')).toBe(true);

        await vi.advanceTimersByTimeAsync(1100);
        expect(FakeWebSocket.instances).toHaveLength(2);
        release(socket);
    });
});
