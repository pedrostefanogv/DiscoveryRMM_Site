import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Terminal } from '@xterm/xterm';

/**
 * Regressão: o viewer do terminal NÃO pode encerrar a sessão no unmount.
 * Isso quebrava o botão "Reconectar" (a página remonta via `key` com
 * credencial nova) e a troca de aba (só a aba ativa é renderizada) — o
 * cleanup antigo chamava stopSession e matava a sessão viva.
 */

const { stopSessionMock, FakeTerminal } = vi.hoisted(() => {
    class FakeTerminal {
        cols = 80;
        rows = 24;
        options: Record<string, unknown> = {};
        buffer = { active: { cursorX: 0, cursorY: 0 } };
        loadAddon() {}
        open() {}
        write() {}
        writeln() {}
        clear() {}
        reset() {}
        dispose() {}
        focus() {}
        onData() { return { dispose() {} }; }
        onResize() { return { dispose() {} }; }
        attachCustomKeyEventHandler() {}
    }
    return { stopSessionMock: vi.fn(), FakeTerminal };
});

vi.mock('@/api/remote-sessions', () => ({
    remoteSessionsApi: { stopSession: stopSessionMock },
}));

vi.mock('@/theme/ThemeContext', () => ({
    useTheme: () => ({ mode: 'dark' }),
}));

vi.mock('./useTerminalStream', () => ({
    useTerminalStream: () => ({
        isConnected: false,
        sendData: vi.fn(),
        sendResize: vi.fn(),
        sendCompletionRequest: vi.fn(),
        onOutput: () => () => {},
        onExit: () => () => {},
        onReady: () => () => {},
        onError: () => () => {},
        onReset: () => () => {},
        onStats: () => () => {},
        onCompletion: () => () => {},
        error: null,
    }),
}));

vi.mock('@xterm/xterm', () => ({ Terminal: FakeTerminal }));
vi.mock('@xterm/addon-fit', () => ({ FitAddon: class { fit() {} } }));
vi.mock('@xterm/addon-web-links', () => ({ WebLinksAddon: class {} }));
vi.mock('@xterm/addon-search', () => ({ SearchAddon: class {} }));
vi.mock('@xterm/addon-clipboard', () => ({ ClipboardAddon: class {} }));

import RemoteTerminal, { createLegacyEditor } from './RemoteTerminal';
import { applyCompletion, detectPrompt, promptRequiresMask, type CompletionResponse } from './terminalInput';

beforeEach(() => {
    stopSessionMock.mockReset();
    // jsdom não implementa ResizeObserver (usado no fit do xterm).
    vi.stubGlobal('ResizeObserver', class {
        observe() {}
        disconnect() {}
        unobserve() {}
    });
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('RemoteTerminal — ciclo de vida da sessão', () => {
    it('não encerra a sessão quando o componente é desmontado', () => {
        const { unmount } = render(
            <RemoteTerminal
                sessionId="sess-1"
                agentId="agent-1"
                natsSubject="tenant.c1.site.s1.agent.a1.remote.session.sess-1"
                natsUrl="wss://nats.example/nats/"
                jwt="jwt-1"
                nkeySeed=""
            />,
        );
        unmount();
        expect(stopSessionMock).not.toHaveBeenCalled();
    });

    it('expõe a identidade da sessão no DOM para diagnóstico/E2E', () => {
        const { container } = render(
            <RemoteTerminal sessionId="sess-9" agentId="agent-9" natsSubject="s" natsUrl="wss://x/" jwt="j" nkeySeed="" />,
        );
        expect(container.querySelector('[data-session-id="sess-9"]')).not.toBeNull();
        expect(container.querySelector('[data-agent-id="agent-9"]')).not.toBeNull();
    });
});

// Fake mínimo do Terminal exigido por createLegacyEditor.
function makeEditorHarness() {
    const writes: string[] = [];
    const sent: string[] = [];
    const term = {
        cols: 80,
        rows: 24,
        buffer: { active: { cursorX: 0, cursorY: 0 } },
        write: (data: string) => { writes.push(data); },
        clear: () => {},
    };
    const editor = createLegacyEditor(
        term as unknown as Terminal,
        () => (data: string) => { sent.push(data); },
    );
    return { editor, writes, sent };
}

describe('terminalInput — completions', () => {
    const baseRes: CompletionResponse = {
        reqId: 'r1',
        ok: true,
        replacementIndex: 2,
        replacementLength: 3,
        matches: [{ text: 'get-ChildItem', listItem: 'get-ChildItem', type: 'Command' }],
        totalCount: 1,
        page: 0,
        pageSize: 50,
        hasMore: false,
    };

    it('completion.res aplica substituição em [replacementIndex, +length)', () => {
        const out = applyCompletion('abXYZcd', 5, baseRes, 0);
        expect(out.line).toBe('abget-ChildItemcd');
        expect(out.cursor).toBe(2 + 'get-ChildItem'.length);
        expect(out.match?.text).toBe('get-ChildItem');
    });

    it('índice inválido não altera a linha', () => {
        const out = applyCompletion('abc', 3, baseRes, 9);
        expect(out.line).toBe('abc');
        expect(out.cursor).toBe(3);
        expect(out.match).toBeNull();
    });

    it('resposta ausente/malformada não quebra a substituição', () => {
        const out = applyCompletion('abc', 1, null, 0);
        expect(out.line).toBe('abc');
        expect(out.cursor).toBe(1);
    });
});

describe('terminalInput — heurística de prompt', () => {
    it('detecta senha, confirmação e paginador', () => {
        expect(detectPrompt('Password: ')).toBe('password');
        expect(detectPrompt('senha:')).toBe('password');
        expect(detectPrompt('Continue? [Y/N] ')).toBe('confirm');
        expect(detectPrompt('--More--')).toBe('pager');
        expect(detectPrompt('Press any key to continue . . .')).toBe('presskey');
    });

    it('só senha exige mascaramento', () => {
        expect(promptRequiresMask('password')).toBe(true);
        expect(promptRequiresMask('confirm')).toBe(false);
        expect(promptRequiresMask(null)).toBe(false);
    });

    it('não confunde saída comum com prompt', () => {
        expect(detectPrompt('PS C:\\Users\\admin>')).toBeNull();
        expect(detectPrompt('arquivo1.txt  arquivo2.txt')).toBeNull();
        // Linha LONGA terminando em ':' (saída/log) não deve virar prompt.
        expect(
            detectPrompt(
                'Relatorio consolidado de todos os itens processados com sucesso e sem erros durante a execucao do lote:',
            ),
        ).toBeNull();
        // Prompt curto genérico continua detectado.
        expect(detectPrompt('Name:')).toBe('generic');
        // Linha com espaçamento de tabela não vira prompt (R11).
        expect(detectPrompt('Handles  NPM(K)    PM(K):')).toBeNull();
    });
});

describe('RemoteTerminal — modo prompt/segredo (T2)', () => {
    it('prompt de senha não entra no histórico local e mascara a exibição', () => {
        const { editor, writes, sent } = makeEditorHarness();
        editor.setPromptMode('password');
        editor.handleKey('s');
        editor.handleKey('3');
        editor.handleKey('c');
        editor.handleKey(String.fromCharCode(13)); // CR

        // Enviou cada tecla imediatamente (sem esperar Enter) e só o CR no fim.
        expect(sent.join('')).toBe('s3c\r');
        // Mascarou na tela e nunca escreveu a senha em claro.
        expect(writes.join('')).toContain('*');
        expect(writes.join('')).not.toContain('s3c');
        // Não pode ser recuperada pelo histórico (KEY_UP).
        editor.handleKey(String.fromCharCode(27) + '[A');
        expect(editor.getLine()).toBe('');
    });

    it('prompt não-secreto é enviado por tecla e entra no histórico', () => {
        const { editor, sent } = makeEditorHarness();
        editor.setPromptMode('confirm');
        editor.handleKey('y');
        editor.handleKey(String.fromCharCode(13)); // CR
        expect(sent.join('')).toBe('y\r');
        editor.handleKey(String.fromCharCode(27) + '[A'); // KEY_UP
        expect(editor.getLine()).toBe('y');
    });
});
