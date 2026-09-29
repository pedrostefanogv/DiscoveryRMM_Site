import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
        onOutput: () => () => {},
        onExit: () => () => {},
        onReady: () => () => {},
        onError: () => () => {},
        onReset: () => () => {},
        error: null,
    }),
}));

vi.mock('@xterm/xterm', () => ({ Terminal: FakeTerminal }));
vi.mock('@xterm/addon-fit', () => ({ FitAddon: class { fit() {} } }));
vi.mock('@xterm/addon-web-links', () => ({ WebLinksAddon: class {} }));
vi.mock('@xterm/addon-search', () => ({ SearchAddon: class {} }));
vi.mock('@xterm/addon-clipboard', () => ({ ClipboardAddon: class {} }));

import RemoteTerminal from './RemoteTerminal';

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
