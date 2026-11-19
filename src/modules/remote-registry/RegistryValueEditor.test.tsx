import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RegistryValueEditor } from './RegistryValueEditor';

// ─────────────────────────────────────────────────────────────────────────────
// Testes do modal de edição.
//
// O foco é o COMPORTAMENTO DE SEGURANÇA: o componente não pode enviar nada sem
// uma ação explícita de confirmação, e não pode habilitar o botão com dado que
// o agente vai recusar. Estes testes não mockam NATS porque o componente não
// conhece NATS — ele apenas chama onConfirm.
// ─────────────────────────────────────────────────────────────────────────────

function setup(overrides: Partial<React.ComponentProps<typeof RegistryValueEditor>> = {}) {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const props = {
        keyPath: 'HKLM\\SOFTWARE\\MinhaEmpresa',
        existing: null,
        onConfirm,
        onCancel,
        ...overrides,
    };
    render(<RegistryValueEditor {...props} />);
    return { onConfirm, onCancel };
}

describe('RegistryValueEditor — nenhum envio sem confirmação', () => {
    it('não chama onConfirm apenas por montar o modal', () => {
        const { onConfirm } = setup();
        // Abrir o formulário não é consentimento: nada pode ser gravado só
        // porque o operador clicou em "Novo valor".
        expect(onConfirm).not.toHaveBeenCalled();
    });

    it('não chama onConfirm ao editar o campo de dado', () => {
        const { onConfirm } = setup();
        const textarea = screen.getByLabelText('Dado');
        fireEvent.change(textarea, { target: { value: 'meu valor' } });
        expect(onConfirm).not.toHaveBeenCalled();
    });

    it('não chama onConfirm ao cancelar', () => {
        const { onConfirm, onCancel } = setup();
        fireEvent.click(screen.getByText('Cancelar'));
        expect(onCancel).toHaveBeenCalledTimes(1);
        expect(onConfirm).not.toHaveBeenCalled();
    });

    it('chama onConfirm com confirmed:true no clique explícito', () => {
        const { onConfirm } = setup();
        fireEvent.change(screen.getByLabelText('Dado'), { target: { value: 'abc' } });
        fireEvent.click(screen.getByText('Gravar valor'));

        expect(onConfirm).toHaveBeenCalledTimes(1);
        expect(onConfirm).toHaveBeenCalledWith({
            name: '',
            type: 'REG_SZ',
            data: 'abc',
            confirmed: true,
        });
    });
});

describe('RegistryValueEditor — validação bloqueia o envio', () => {
    it('desabilita "Gravar" para DWORD inválido', () => {
        setup();
        fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'REG_DWORD' } });
        fireEvent.change(screen.getByLabelText('Dado'), { target: { value: 'abc' } });

        const button = screen.getByText('Gravar valor') as HTMLButtonElement;
        expect(button.disabled).toBe(true);
        // E a mensagem precisa explicar o que é aceito, não só "inválido".
        expect(screen.getByText(/4294967295/)).toBeTruthy();
    });

    it('habilita "Gravar" para DWORD válido', () => {
        setup();
        fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'REG_DWORD' } });
        fireEvent.change(screen.getByLabelText('Dado'), { target: { value: '255' } });

        const button = screen.getByText('Gravar valor') as HTMLButtonElement;
        expect(button.disabled).toBe(false);
    });

    it('mostra o equivalente hexadecimal do DWORD digitado', () => {
        setup();
        fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'REG_DWORD' } });
        fireEvent.change(screen.getByLabelText('Dado'), { target: { value: '255' } });
        expect(screen.getByText(/0x000000FF/)).toBeTruthy();
    });

    it('mostra o equivalente hexadecimal de QWORD com 16 dígitos', () => {
        setup();
        fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'REG_QWORD' } });
        fireEvent.change(screen.getByLabelText('Dado'), { target: { value: '1' } });
        expect(screen.getByText(/0x0000000000000001/)).toBeTruthy();
    });
});

describe('RegistryValueEditor — prévia do que será gravado', () => {
    it('mostra o valor final, não o formato de entrada', () => {
        setup();
        fireEvent.change(screen.getByLabelText('Nome do valor'), { target: { value: 'MeuValor' } });
        fireEvent.change(screen.getByLabelText('Dado'), { target: { value: 'conteudo' } });
        // O operador precisa conferir o efeito real antes de confirmar.
        expect(screen.getByText(/MeuValor = conteudo/)).toBeTruthy();
    });

    it('rotula o nome vazio como (Padrão)', () => {
        setup();
        fireEvent.change(screen.getByLabelText('Dado'), { target: { value: 'x' } });
        expect(screen.getByText(/\(Padrão\) = x/)).toBeTruthy();
    });
});

describe('RegistryValueEditor — MULTI_SZ', () => {
    it('permite adicionar, editar e remover itens', () => {
        const { onConfirm } = setup();
        fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'REG_MULTI_SZ' } });

        fireEvent.click(screen.getByText('Adicionar item'));
        fireEvent.click(screen.getByText('Adicionar item'));
        fireEvent.change(screen.getByLabelText('Item 1'), { target: { value: 'primeiro' } });
        fireEvent.change(screen.getByLabelText('Item 2'), { target: { value: 'segundo' } });

        fireEvent.click(screen.getByText('Gravar valor'));
        expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({
            type: 'REG_MULTI_SZ',
            // Formato JSON (sem perda), o MESMO que o agente espera.
            data: '["primeiro","segundo"]',
        }));
    });

    it('preserva item vazio como posição significativa', () => {
        const { onConfirm } = setup();
        fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'REG_MULTI_SZ' } });
        fireEvent.click(screen.getByText('Adicionar item'));
        fireEvent.click(screen.getByText('Adicionar item'));
        fireEvent.change(screen.getByLabelText('Item 1'), { target: { value: 'a' } });
        // Item 2 fica vazio de propósito.

        fireEvent.click(screen.getByText('Gravar valor'));
        expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({
            // Item vazio preservado como posição significativa.
            data: '["a",""]',
        }));
    });

    it('remove um item pelo botão ×', () => {
        setup();
        fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'REG_MULTI_SZ' } });
        fireEvent.click(screen.getByText('Adicionar item'));
        fireEvent.change(screen.getByLabelText('Item 1'), { target: { value: 'unico' } });
        fireEvent.click(screen.getByLabelText('Remover item 1'));
        expect(screen.queryByLabelText('Item 1')).toBeNull();
    });
});

describe('RegistryValueEditor — erro do agente', () => {
    it('exibe o erro devolvido (ex.: chave protegida)', () => {
        setup({ error: 'chave protegida por politica' });
        expect(screen.getByText('chave protegida por politica')).toBeTruthy();
    });

    it('desabilita os botões enquanto grava', () => {
        setup({ busy: true });
        expect((screen.getByText('Gravando…') as HTMLButtonElement).disabled).toBe(true);
        expect((screen.getByText('Cancelar') as HTMLButtonElement).disabled).toBe(true);
    });
});

describe('RegistryValueEditor — pré-preenchimento na edição', () => {
    it('carrega o valor existente nos campos', () => {
        setup({
            existing: { name: 'Flag', type: 'REG_DWORD', data: '42' },
        });
        expect((screen.getByLabelText('Nome do valor') as HTMLInputElement).value).toBe('Flag');
        expect((screen.getByLabelText('Dado') as HTMLTextAreaElement).value).toBe('42');
    });

    it('carrega a lista de um MULTI_SZ existente', () => {
        setup({
            existing: {
                name: 'Lista',
                type: 'REG_MULTI_SZ',
                data: 'a\nb',
                stringList: ['a', 'b'],
            },
        });
        expect((screen.getByLabelText('Item 1') as HTMLInputElement).value).toBe('a');
        expect((screen.getByLabelText('Item 2') as HTMLInputElement).value).toBe('b');
    });
});
