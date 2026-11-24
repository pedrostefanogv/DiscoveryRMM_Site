import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { RegistryPanel } from './RegistryPanel';

// ─────────────────────────────────────────────────────────────────────────────
// Testes de LAYOUT e usabilidade do painel.
//
// Origem: o operador relatou que não conseguia "ver o registro por completo" e
// que a árvore lateral não funcionava. Estes testes travam as propriedades de
// layout que fazem o painel ser usável:
//   - a cadeia de altura chega ao container (h-full/min-h-0), para a grade
//     ocupar a tela em vez de uma faixa;
//   - a árvore é redimensionável (divisória arrastável);
//   - o caminho completo está acessível (breadcrumb navegável);
//   - a grade mostra nome, tipo, dado e ações em colunas distintas.
// ─────────────────────────────────────────────────────────────────────────────

const sendMock = vi.fn();
vi.mock('./useRegistryStream', () => ({
    useRegistryStream: () => ({
        isConnected: true, isReady: true, error: null, agentProtocolVersion: 1,
        initialActiveUser: null,
        onReady: () => () => {}, send: sendMock,
    }),
}));

function listOk(hive: string, path: string, subkeys: string[], values: any[] = []) {
    return {
        success: true, requestId: 'r', hive, path,
        page: { hive, path, subkeys, values, hasMore: false, subkeyCount: subkeys.length, valueCount: values.length },
    };
}
function statOk(hive: string, path: string, writable = true) {
    return { success: true, requestId: 's', hive, path, key: { hive, path, subkeyCount: 0, valueCount: 0, writable, denyReason: '' } };
}

beforeEach(() => { sendMock.mockReset(); });

describe('RegistryPanel — layout e usabilidade', () => {
    it('usa cadeia de altura total para a grade ocupar a tela', async () => {
        sendMock.mockImplementation(async (a: string, args: any) => {
            if (a === 'listKey') return listOk(args.hive, args.path, ['SOFTWARE'], []);
            return statOk(args.hive, args.path);
        });

        render(<RegistryPanel natsSubject="s" natsUrl="wss://x/" jwt="j" />);
        const panel = await waitFor(() => screen.getByTestId('registry-panel'));

        // h-full + min-h-0 é o que impede o painel de colapsar dentro do flex pai.
        expect(panel.className).toContain('h-full');
        expect(panel.className).toContain('min-h-0');
        expect(panel.className).toContain('flex-col');
    });

    it('oferece divisória arrastável para redimensionar a árvore', async () => {
        sendMock.mockImplementation(async (a: string, args: any) => {
            if (a === 'listKey') return listOk(args.hive, args.path, [], []);
            return statOk(args.hive, args.path);
        });

        render(<RegistryPanel natsSubject="s" natsUrl="wss://x/" jwt="j" />);
        const separator = await waitFor(() => screen.getByRole('separator'));

        expect(separator.getAttribute('aria-orientation')).toBe('vertical');
        expect(separator.className).toContain('cursor-col-resize');
    });

    it('mostra o caminho completo no breadcrumb navegável', async () => {
        sendMock.mockImplementation(async (a: string, args: any) => {
            if (a === 'listKey') {
                return listOk(args.hive, args.path, args.path === '' ? ['SOFTWARE'] : [], []);
            }
            return statOk(args.hive, args.path);
        });

        render(<RegistryPanel natsSubject="s" natsUrl="wss://x/" jwt="j" />);
        await waitFor(() => expect(screen.getByTestId('registry-subkey-SOFTWARE')).toBeTruthy());

        // Navega para HKLM\SOFTWARE via subchave.
        fireEvent.click(screen.getByTestId('registry-subkey-SOFTWARE'));

        await waitFor(() => {
            expect(screen.getByTestId('registry-current-path').getAttribute('data-path')).toBe('HKLM\\SOFTWARE');
        });
        // O breadcrumb expõe o hive e o segmento, ambos clicáveis.
        const nav = screen.getByTestId('registry-current-path');
        expect(nav.textContent).toContain('HKLM');
        expect(nav.textContent).toContain('SOFTWARE');
    });

    it('apresenta as três colunas de dados (nome, tipo, dado) e ações', async () => {
        sendMock.mockImplementation(async (a: string, args: any) => {
            if (a === 'listKey') {
                return listOk(args.hive, args.path, [], [
                    { name: 'DisplayName', type: 'REG_SZ', data: 'Valor de teste' },
                    { name: '', type: 'REG_DWORD', data: '255' },
                ]);
            }
            return statOk(args.hive, args.path);
        });

        render(<RegistryPanel natsSubject="s" natsUrl="wss://x/" jwt="j" />);

        await waitFor(() => expect(screen.getByText('DisplayName')).toBeTruthy());
        // O valor sem nome aparece como (Padrão), como no regedit.
        expect(screen.getByText('(Padrão)')).toBeTruthy();
        // DWORD mostra decimal E hexadecimal — conferência contra o regedit.
        expect(screen.getByText('255')).toBeTruthy();
        expect(screen.getByText(/0x000000FF/)).toBeTruthy();
        // Cabeçalhos das colunas.
        expect(screen.getByText('Nome')).toBeTruthy();
        expect(screen.getByText('Tipo')).toBeTruthy();
        expect(screen.getByText('Dado')).toBeTruthy();
    });

    it('mantém a árvore utilizável durante o carregamento de uma chave', async () => {
        // O carregamento NÃO pode substituir o conteúdo inteiro: senão o
        // operador perde a árvore e não consegue navegar para outro lugar.
        const slow: { resolve: ((v: unknown) => void) | null } = { resolve: null };
        sendMock.mockImplementation(async (a: string, args: any) => {
            if (a === 'statKey') return statOk(args.hive, args.path);
            if (args.path === 'LENTA') return new Promise((res) => { slow.resolve = res; });
            return listOk(args.hive, args.path, ['LENTA', 'OUTRA'], []);
        });

        render(<RegistryPanel natsSubject="s" natsUrl="wss://x/" jwt="j" />);
        await waitFor(() => expect(screen.getByTestId('registry-subkey-LENTA')).toBeTruthy());

        fireEvent.click(screen.getByTestId('registry-subkey-LENTA'));

        // A árvore continua no DOM e a outra subchave segue clicável.
        expect(screen.getByRole('tree')).toBeTruthy();
        await waitFor(() => expect(screen.getByTestId('registry-subkey-OUTRA')).toBeTruthy());

        slow.resolve?.(listOk('HKLM', 'LENTA', [], []));
    });

    it('oferece filtro quando a chave é grande', async () => {
        const manySubkeys = Array.from({ length: 40 }, (_, i) => `Sub${i}`);
        sendMock.mockImplementation(async (a: string, args: any) => {
            if (a === 'listKey') return listOk(args.hive, args.path, manySubkeys, []);
            return statOk(args.hive, args.path);
        });

        render(<RegistryPanel natsSubject="s" natsUrl="wss://x/" jwt="j" />);
        const filterInput = await waitFor(() => screen.getByLabelText('Filtrar'));

        fireEvent.change(filterInput, { target: { value: 'Sub1' } });
        // Filtra tanto valores quanto subchaves.
        await waitFor(() => expect(screen.getByTestId('registry-subkey-Sub1')).toBeTruthy());
        expect(screen.queryByTestId('registry-subkey-Sub2')).toBeNull();
    });
});
