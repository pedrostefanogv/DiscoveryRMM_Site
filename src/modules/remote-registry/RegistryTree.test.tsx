import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RegistryTree } from './RegistryTree';

// ─────────────────────────────────────────────────────────────────────────────
// Testes da árvore do registro.
//
// O defeito que originou estes testes: a versão anterior mostrava apenas UM
// nível e, ao clicar numa subchave, NAVEGAVA em vez de expandir — a árvore
// "não funcionava" na percepção do operador. Um editor de registro exige
// hierarquia navegável e persistente.
// ─────────────────────────────────────────────────────────────────────────────

function setup(subkeys: Record<string, string[]>) {
    const loadSubkeys = vi.fn(async (hive: string, path: string) => {
        const key = path === '' ? `${hive}:` : `${hive}:${path}`;
        if (key in subkeys) return subkeys[key];
        return [];
    });
    const onSelect = vi.fn();
    render(
        <RegistryTree
            activeHive="HKLM"
            activePath=""
            onSelect={onSelect}
            loadSubkeys={loadSubkeys}
        />,
    );
    return { loadSubkeys, onSelect };
}

describe('RegistryTree — expansão recursiva', () => {
    it('mostra os 5 hives na raiz', () => {
        setup({});
        expect(screen.getByText('HKEY_LOCAL_MACHINE')).toBeTruthy();
        expect(screen.getByText('HKEY_CURRENT_USER')).toBeTruthy();
        expect(screen.getByText('HKEY_CLASSES_ROOT')).toBeTruthy();
        expect(screen.getByText('HKEY_USERS')).toBeTruthy();
        expect(screen.getByText('HKEY_CURRENT_CONFIG')).toBeTruthy();
    });

    it('expande um hive e mostra as subchaves', async () => {
        const { loadSubkeys } = setup({
            'HKLM:': ['SOFTWARE', 'SYSTEM', 'HARDWARE'],
        });

        fireEvent.click(screen.getByLabelText('Expandir HKEY_LOCAL_MACHINE'));

        await waitFor(() => expect(screen.getByText('SOFTWARE')).toBeTruthy());
        expect(screen.getByText('SYSTEM')).toBeTruthy();
        expect(loadSubkeys).toHaveBeenCalledWith('HKLM', '');
    });

    it('expande DOIS níveis — a hierarquia se mantém visível', async () => {
        // Este é o comportamento que faltava: depois de expandir SOFTWARE, o nó
        // pai continua visível e o filho aparece aninhado.
        const { loadSubkeys } = setup({
            'HKLM:': ['SOFTWARE'],
            'HKLM:SOFTWARE': ['Microsoft', 'MinhaEmpresa'],
        });

        fireEvent.click(screen.getByLabelText('Expandir HKEY_LOCAL_MACHINE'));
        await waitFor(() => expect(screen.getByText('SOFTWARE')).toBeTruthy());

        fireEvent.click(screen.getByLabelText('Expandir SOFTWARE'));
        await waitFor(() => expect(screen.getByText('Microsoft')).toBeTruthy());

        // O pai continua na árvore (não houve navegação que o removesse).
        expect(screen.getByText('SOFTWARE')).toBeTruthy();
        expect(screen.getByText('HKEY_LOCAL_MACHINE')).toBeTruthy();
        expect(loadSubkeys).toHaveBeenCalledWith('HKLM', 'SOFTWARE');
    });

    it('expande três níveis', async () => {
        const { loadSubkeys } = setup({
            'HKLM:': ['SOFTWARE'],
            'HKLM:SOFTWARE': ['Microsoft'],
            'HKLM:SOFTWARE\\Microsoft': ['Windows NT'],
        });

        fireEvent.click(screen.getByLabelText('Expandir HKEY_LOCAL_MACHINE'));
        await waitFor(() => expect(screen.getByText('SOFTWARE')).toBeTruthy());
        fireEvent.click(screen.getByLabelText('Expandir SOFTWARE'));
        await waitFor(() => expect(screen.getByText('Microsoft')).toBeTruthy());
        fireEvent.click(screen.getByLabelText('Expandir Microsoft'));
        await waitFor(() => expect(screen.getByText('Windows NT')).toBeTruthy());

        expect(loadSubkeys).toHaveBeenCalledWith('HKLM', 'SOFTWARE\\Microsoft');
    });

    it('recolhe e reexpande SEM refazer a chamada (cache)', async () => {
        const { loadSubkeys } = setup({ 'HKLM:': ['SOFTWARE'] });

        fireEvent.click(screen.getByLabelText('Expandir HKEY_LOCAL_MACHINE'));
        await waitFor(() => expect(screen.getByText('SOFTWARE')).toBeTruthy());
        const callsAfterFirst = loadSubkeys.mock.calls.length;

        // Recolhe.
        fireEvent.click(screen.getByLabelText('Recolher HKEY_LOCAL_MACHINE'));
        await waitFor(() => expect(screen.queryByText('SOFTWARE')).toBeNull());

        // Reexpande: não deve chamar o agente de novo.
        fireEvent.click(screen.getByLabelText('Expandir HKEY_LOCAL_MACHINE'));
        await waitFor(() => expect(screen.getByText('SOFTWARE')).toBeTruthy());
        expect(loadSubkeys.mock.calls.length).toBe(callsAfterFirst);
    });

    it('seleciona um nó ao clicar no nome (sem expandir)', async () => {
        const { onSelect } = setup({ 'HKLM:': ['SOFTWARE'] });

        fireEvent.click(screen.getByLabelText('Expandir HKEY_LOCAL_MACHINE'));
        await waitFor(() => expect(screen.getByText('SOFTWARE')).toBeTruthy());

        fireEvent.click(screen.getByText('SOFTWARE'));
        expect(onSelect).toHaveBeenCalledWith('HKLM', 'SOFTWARE');
    });
});

describe('RegistryTree — erro por nó não derruba a árvore', () => {
    it('mostra o erro no nó e mantém o resto navegável', async () => {
        // Uma chave sem permissão (ex.: HKLM\SAM) não pode inutilizar a árvore.
        const loadSubkeys = vi.fn(async (_hive: string, path: string) => {
            if (path === 'SAM') throw new Error('chave protegida por política');
            return ['SAM', 'SOFTWARE'];
        });
        render(
            <RegistryTree activeHive="HKLM" activePath="" onSelect={vi.fn()} loadSubkeys={loadSubkeys} />,
        );

        fireEvent.click(screen.getByLabelText('Expandir HKEY_LOCAL_MACHINE'));
        await waitFor(() => expect(screen.getByText('SAM')).toBeTruthy());

        fireEvent.click(screen.getByLabelText('Expandir SAM'));
        await waitFor(() => expect(screen.getByText(/chave protegida por política/)).toBeTruthy());

        // O restante da árvore continua utilizável.
        expect(screen.getByText('SOFTWARE')).toBeTruthy();
        expect(screen.getByText('HKEY_LOCAL_MACHINE')).toBeTruthy();
    });
});

describe('RegistryTree — revela o caminho ativo', () => {
    it('expande automaticamente os ancestrais do nó selecionado', async () => {
        // Ao abrir HKLM\SOFTWARE\Microsoft pelo breadcrumb, a árvore precisa
        // revelar esse caminho em vez de deixá-lo escondido.
        const loadSubkeys = vi.fn(async (_hive: string, path: string) => {
            if (path === '') return ['SOFTWARE'];
            if (path === 'SOFTWARE') return ['Microsoft'];
            return [];
        });

        render(
            <RegistryTree
                activeHive="HKLM"
                activePath="SOFTWARE\\Microsoft"
                onSelect={vi.fn()}
                loadSubkeys={loadSubkeys}
            />,
        );

        await waitFor(() => expect(screen.getByText('Microsoft')).toBeTruthy());
        expect(screen.getByText('SOFTWARE')).toBeTruthy();
    });
});
