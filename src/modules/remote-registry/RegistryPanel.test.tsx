import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RegistryPanel } from './RegistryPanel';

// ─────────────────────────────────────────────────────────────────────────────
// Testes do painel do Registro.
//
// O foco é o comportamento sob CONCORRÊNCIA e sob FALHA — os dois casos que o
// caminho feliz não exercita e onde estavam os defeitos reais encontrados em
// revisão (resposta obsoleta sobrescrevendo a chave atual; permissão de escrita
// obsoleta mantida após uma navegação que falhou).
// ─────────────────────────────────────────────────────────────────────────────

// Mock do hook de stream: o painel não conhece NATS, então o teste controla as
// respostas diretamente.
const sendMock = vi.fn();
let readyCallbacks: Array<() => void> = [];
let readyState = true;

vi.mock('./useRegistryStream', () => ({
    useRegistryStream: () => ({
        isConnected: true,
        isReady: readyState,
        error: null,
        agentProtocolVersion: 1,
        onReady: (cb: () => void) => { readyCallbacks.push(cb); return () => {}; },
        send: sendMock,
    }),
}));

function listOk(hive: string, path: string, subkeys: string[], values: any[] = []) {
    return {
        success: true, requestId: 'r', hive, path,
        page: { hive, path, subkeys, values, hasMore: false, subkeyCount: subkeys.length, valueCount: values.length },
        note: undefined,
    };
}

function statOk(hive: string, path: string, writable = true, denyReason?: string) {
    return {
        success: true, requestId: 's', hive, path,
        key: { hive, path, subkeyCount: 0, valueCount: 0, writable, denyReason },
    };
}

beforeEach(() => {
    sendMock.mockReset();
    readyCallbacks = [];
    readyState = true;
});

describe('RegistryPanel — carregamento inicial', () => {
    it('carrega HKLM ao ficar pronto e mostra a árvore', async () => {
        sendMock.mockImplementation(async (action: string, args: any) => {
            if (action === 'listKey') return listOk(args.hive, args.path, ['SOFTWARE']);
            return statOk(args.hive, args.path);
        });

        render(<RegistryPanel natsSubject="s" natsUrl="wss://x/" jwt="j" />);

        await waitFor(() => {
            expect(screen.getByTestId('registry-current-path').getAttribute('data-path')).toBe('HKLM');
        });
        expect(sendMock).toHaveBeenCalledWith('listKey', expect.objectContaining({ hive: 'HKLM', path: '' }));
        // A árvore agora mostra os filhos da raiz (recursiva), não só os hives.
        await waitFor(() => expect(screen.getByTestId('registry-subkey-SOFTWARE')).toBeTruthy());
    });

    it('mostra a nota do agente (ex.: HKCU é a chave do SYSTEM)', async () => {
        sendMock.mockImplementation(async (action: string, args: any) => {
            if (action === 'listKey') {
                return { ...listOk(args.hive, args.path, []), note: 'HKCU é a chave do SYSTEM' };
            }
            return statOk(args.hive, args.path);
        });

        render(<RegistryPanel natsSubject="s" natsUrl="wss://x/" jwt="j" />);

        await waitFor(() => {
            expect(screen.getByTestId('registry-note').textContent).toContain('SYSTEM');
        });
    });
});

describe('RegistryPanel — resposta obsoleta não sobrescreve a chave atual', () => {
    it('descarta a resposta de uma navegação antiga que chega depois', async () => {
        // Corrida real: o operador clica em duas subchaves em sequência. Se a
        // PRIMEIRA responder depois da segunda, o painel mostraria o conteúdo da
        // chave abandonada — e os botões de escrita passariam a apontar para
        // outra chave que não a exibida.
        const deferred: { resolve: ((v: unknown) => void) | null } = { resolve: null };

        sendMock.mockImplementation(async (action: string, args: any) => {
            if (action === 'statKey') return statOk(args.hive, args.path);

            // A primeira navegação (para "LENTA") fica pendente.
            if (args.path === 'LENTA') {
                return new Promise((resolve) => { deferred.resolve = resolve; });
            }
            if (args.path === 'RAPIDA') {
                return listOk(args.hive, 'RAPIDA', ['resultado-rapido']);
            }
            return listOk(args.hive, args.path, ['LENTA', 'RAPIDA']);
        });

        render(<RegistryPanel natsSubject="s" natsUrl="wss://x/" jwt="j" />);
        await waitFor(() => expect(screen.getByTestId('registry-subkey-LENTA')).toBeTruthy());

        // Clica em LENTA (fica pendente), depois em RAPIDA (resolve na hora).
        fireEvent.click(screen.getByTestId('registry-subkey-LENTA'));
        fireEvent.click(screen.getByTestId('registry-subkey-RAPIDA'));

        await waitFor(() => {
            expect(screen.getByTestId('registry-current-path').getAttribute('data-path')).toBe('HKLM\\RAPIDA');
        });

        // Agora a resposta antiga chega. NÃO pode sobrescrever.
        deferred.resolve?.(listOk('HKLM', 'LENTA', ['resultado-lento']));

        await waitFor(() => {
            expect(screen.getByTestId('registry-current-path').getAttribute('data-path')).toBe('HKLM\\RAPIDA');
        });
    });
});

describe('RegistryPanel — falha de navegação revoga a escrita', () => {
    it('desabilita a escrita quando a chave não pôde ser carregada', async () => {
        // Fail-closed: manter a permissão do estado anterior deixaria os botões
        // habilitados apontando para uma chave que nem foi carregada.
        sendMock.mockImplementation(async (action: string, args: any) => {
            if (action === 'statKey') return statOk(args.hive, args.path, true);
            if (args.path === 'PROIBIDA') {
                return { success: false, requestId: 'r', errorKind: 'protected', error: 'bloqueada' };
            }
            return listOk(args.hive, args.path, ['PROIBIDA']);
        });

        render(<RegistryPanel natsSubject="s" natsUrl="wss://x/" jwt="j" />);
        await waitFor(() => expect(screen.getByTestId('registry-subkey-PROIBIDA')).toBeTruthy());

        // Clica no chip de subchave (a árvore também mostra o nome; o testid
        // desambigua e garante que estamos acionando a navegação do painel).
        fireEvent.click(screen.getByTestId('registry-subkey-PROIBIDA'));

        await waitFor(() => {
            expect(screen.getByTestId('registry-error')).toBeTruthy();
        });
        expect(screen.getByTestId('registry-error').textContent).toMatch(/política/i);

        // O botão "Novo valor" precisa estar desabilitado após a falha.
        // (getByRole, não getByText: o estado vazio também menciona o texto.)
        const novo = screen.getByRole('button', { name: 'Novo valor' }) as HTMLButtonElement;
        expect(novo.disabled).toBe(true);
    });

    it('traduz o errorKind em orientação acionável', async () => {
        sendMock.mockImplementation(async (action: string, args: any) => {
            if (action === 'statKey') return statOk(args.hive, args.path);
            if (args.path === 'SEMACESSO') {
                return { success: false, requestId: 'r', errorKind: 'access_denied', error: 'negado' };
            }
            return listOk(args.hive, args.path, ['SEMACESSO']);
        });

        render(<RegistryPanel natsSubject="s" natsUrl="wss://x/" jwt="j" />);
        await waitFor(() => expect(screen.getByTestId('registry-subkey-SEMACESSO')).toBeTruthy());
        fireEvent.click(screen.getByTestId('registry-subkey-SEMACESSO'));

        await waitFor(() => {
            // Diferente de "protegida por política": aqui é privilégio do SO.
            expect(screen.getByText(/não tem privilégio/i)).toBeTruthy();
        });
    });
});

describe('RegistryPanel — chave somente-leitura', () => {
    it('desabilita as ações de escrita e explica o motivo', async () => {
        sendMock.mockImplementation(async (action: string, args: any) => {
            if (action === 'listKey') return listOk(args.hive, args.path, []);
            return statOk(args.hive, args.path, false, 'Run é somente leitura para diagnóstico');
        });

        render(<RegistryPanel natsSubject="s" natsUrl="wss://x/" jwt="j" />);

        await waitFor(() => {
            expect(screen.getByTestId('registry-readonly')).toBeTruthy();
        });
        const banner = screen.getByTestId('registry-readonly');
        expect(banner.textContent).toMatch(/Somente leitura nesta chave/);
        // O motivo precisa estar visível — não basta desabilitar.
        expect(banner.textContent).toMatch(/somente leitura para diagnóstico/);

        const novo = screen.getByRole('button', { name: 'Novo valor' }) as HTMLButtonElement;
        expect(novo.disabled).toBe(true);
    });
});

describe('RegistryPanel — exclusão de chave', () => {
    it('distingue exclusão simples de exclusão recursiva', async () => {
        // A diferença de risco é enorme (uma remove a chave, a outra a subárvore
        // inteira). Precisa ser uma escolha explícita, nunca um upgrade silencioso.
        sendMock.mockImplementation(async (action: string, args: any) => {
            if (action === 'listKey') {
                // A raiz do hive não pode ser excluída (correto); navegamos para
                // uma subchave, que é onde a exclusão faz sentido.
                return listOk(args.hive, args.path, args.path === '' ? ['MinhaEmpresa'] : [], []);
            }
            return statOk(args.hive, args.path, true);
        });

        render(<RegistryPanel natsSubject="s" natsUrl="wss://x/" jwt="j" />);
        await waitFor(() => expect(screen.getByTestId('registry-subkey-MinhaEmpresa')).toBeTruthy());
        fireEvent.click(screen.getByTestId('registry-subkey-MinhaEmpresa'));
        await waitFor(() => expect(screen.getByText('Excluir chave')).toBeTruthy());

        expect(screen.getByText('Excluir com subchaves')).toBeTruthy();

        fireEvent.click(screen.getByText('Excluir com subchaves'));
        // O modal precisa declarar o escopo e o aviso extra.
        await waitFor(() => {
            expect(screen.getByText(/Excluir chave e TODAS as subchaves/)).toBeTruthy();
            expect(screen.getByText(/Exclusão recursiva/)).toBeTruthy();
        });
    });

    it('não envia nada até a confirmação explícita', async () => {
        sendMock.mockImplementation(async (action: string, args: any) => {
            if (action === 'listKey') {
                return listOk(args.hive, args.path, args.path === '' ? ['MinhaEmpresa'] : [], []);
            }
            return statOk(args.hive, args.path, true);
        });

        render(<RegistryPanel natsSubject="s" natsUrl="wss://x/" jwt="j" />);
        await waitFor(() => expect(screen.getByTestId('registry-subkey-MinhaEmpresa')).toBeTruthy());
        fireEvent.click(screen.getByTestId('registry-subkey-MinhaEmpresa'));
        await waitFor(() => expect(screen.getByText('Excluir chave')).toBeTruthy());

        fireEvent.click(screen.getByText('Excluir chave'));
        await waitFor(() => expect(screen.getByText('Excluir definitivamente')).toBeTruthy());

        // Abrir o modal NÃO é confirmação.
        expect(sendMock).not.toHaveBeenCalledWith('deleteKey', expect.anything());

        fireEvent.click(screen.getByText('Excluir definitivamente'));
        await waitFor(() => {
            expect(sendMock).toHaveBeenCalledWith('deleteKey', expect.objectContaining({
                confirmed: true,
                recursive: false,
            }));
        });
    });

    it('cancela sem enviar', async () => {
        sendMock.mockImplementation(async (action: string, args: any) => {
            if (action === 'listKey') {
                return listOk(args.hive, args.path, args.path === '' ? ['MinhaEmpresa'] : [], []);
            }
            return statOk(args.hive, args.path, true);
        });

        render(<RegistryPanel natsSubject="s" natsUrl="wss://x/" jwt="j" />);
        await waitFor(() => expect(screen.getByTestId('registry-subkey-MinhaEmpresa')).toBeTruthy());
        fireEvent.click(screen.getByTestId('registry-subkey-MinhaEmpresa'));
        await waitFor(() => expect(screen.getByText('Excluir chave')).toBeTruthy());
        fireEvent.click(screen.getByText('Excluir chave'));
        await waitFor(() => expect(screen.getByText('Cancelar')).toBeTruthy());
        fireEvent.click(screen.getByText('Cancelar'));

        expect(sendMock).not.toHaveBeenCalledWith('deleteKey', expect.anything());
    });
});

describe('RegistryPanel — valores', () => {
    it('marca valor ilegível em vez de mostrá-lo como vazio', async () => {
        sendMock.mockImplementation(async (action: string, args: any) => {
            if (action === 'listKey') {
                return listOk(args.hive, args.path, [], [
                    { name: 'Legivel', type: 'REG_SZ', data: 'ok' },
                    { name: 'Ilegivel', type: 'REG_NONE', data: '', readError: 'acesso negado' },
                ]);
            }
            return statOk(args.hive, args.path);
        });

        render(<RegistryPanel natsSubject="s" natsUrl="wss://x/" jwt="j" />);

        await waitFor(() => expect(screen.getByText('Legivel')).toBeTruthy());
        // O valor ilegível precisa ser distinguível de um REG_NONE realmente vazio.
        expect(screen.getByText('Ilegivel')).toBeTruthy();
        expect(screen.getByText(/não foi possível ler/i)).toBeTruthy();
    });

    it('não oferece edição para tipos de estrutura binária', async () => {
        sendMock.mockImplementation(async (action: string, args: any) => {
            if (action === 'listKey') {
                return listOk(args.hive, args.path, [], [
                    { name: 'Recurso', type: 'REG_RESOURCE_LIST', data: 'AAEC' },
                ]);
            }
            return statOk(args.hive, args.path);
        });

        render(<RegistryPanel natsSubject="s" natsUrl="wss://x/" jwt="j" />);
        await waitFor(() => expect(screen.getByText('Recurso')).toBeTruthy());

        const editar = screen.getByText('Editar') as HTMLButtonElement;
        // Editar como texto corromperia o formato interno do tipo.
        expect(editar.disabled).toBe(true);
    });
});
