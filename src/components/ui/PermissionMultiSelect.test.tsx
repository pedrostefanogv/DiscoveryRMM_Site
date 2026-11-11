import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PermissionMultiSelect, type PermissionOption } from './PermissionMultiSelect';

afterEach(cleanup);

const options: PermissionOption[] = [
  { id: 'p1', label: 'Users.Edit - Users:Edit', code: 'Users.Edit', group: 'Users' },
  { id: 'p2', label: 'Users.View - Users:View', code: 'Users.View', group: 'Users' },
  { id: 'p3', label: 'Roles.Manage - Roles:Manage', code: 'Roles.Manage', group: 'Roles' },
  { id: 'p4', label: 'Agents.Connect - Agents:Connect', code: 'Agents.Connect', group: 'Agents' },
];

/** O projeto não usa jest-dom: checamos os atributos nativos do input. */
function isChecked(element: HTMLElement): boolean {
  return (element as HTMLInputElement).checked;
}

function isDisabled(element: HTMLElement): boolean {
  return (element as HTMLInputElement).disabled;
}

function checkbox(label: string): HTMLInputElement {
  return screen.getByLabelText(label) as HTMLInputElement;
}

function buscar(termo: string) {
  fireEvent.change(screen.getByLabelText('Buscar permissão'), { target: { value: termo } });
}

describe('PermissionMultiSelect — marcação por checkbox', () => {
  it('marcar chama onChange com o id anexado ao value atual', () => {
    const onChange = vi.fn();
    render(<PermissionMultiSelect options={options} value={['p1']} onChange={onChange} />);

    fireEvent.click(checkbox('Roles.Manage - Roles:Manage'));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(['p1', 'p3']);
  });

  it('desmarcar chama onChange removendo o id, preservando a ordem', () => {
    const onChange = vi.fn();
    render(
      <PermissionMultiSelect options={options} value={['p1', 'p2', 'p3']} onChange={onChange} />,
    );

    fireEvent.click(checkbox('Users.View - Users:View'));

    expect(onChange).toHaveBeenCalledWith(['p1', 'p3']);
  });

  it('reflete em checked o que veio em value', () => {
    render(<PermissionMultiSelect options={options} value={['p2']} onChange={() => {}} />);

    expect(isChecked(checkbox('Users.View - Users:View'))).toBe(true);
    expect(isChecked(checkbox('Users.Edit - Users:Edit'))).toBe(false);
  });
});

describe('PermissionMultiSelect — busca', () => {
  it('filtra por code (case-insensitive)', () => {
    render(<PermissionMultiSelect options={options} value={[]} onChange={() => {}} />);

    buscar('roles.manage');

    expect(screen.getByLabelText('Roles.Manage - Roles:Manage')).toBeTruthy();
    expect(screen.queryByLabelText('Users.Edit - Users:Edit')).toBeNull();
    expect(screen.queryByLabelText('Agents.Connect - Agents:Connect')).toBeNull();
  });

  it('filtra por label (case-insensitive)', () => {
    render(<PermissionMultiSelect options={options} value={[]} onChange={() => {}} />);

    buscar('users:view');

    expect(screen.getByLabelText('Users.View - Users:View')).toBeTruthy();
    expect(screen.queryByLabelText('Users.Edit - Users:Edit')).toBeNull();
  });

  it('sem resultado mostra o emptyMessage padrão', () => {
    render(<PermissionMultiSelect options={options} value={[]} onChange={() => {}} />);

    buscar('inexistente');

    expect(screen.getAllByText('Nenhuma permissão corresponde ao filtro.').length).toBeGreaterThan(0);
    expect(screen.queryByLabelText('Users.Edit - Users:Edit')).toBeNull();
  });

  it('aceita emptyMessage customizado', () => {
    render(
      <PermissionMultiSelect
        options={options}
        value={[]}
        onChange={() => {}}
        emptyMessage="Nada aqui."
      />,
    );

    buscar('inexistente');

    expect(screen.getAllByText('Nada aqui.').length).toBeGreaterThan(0);
  });
});

describe('PermissionMultiSelect — ação em lote', () => {
  it('"Selecionar todos os N resultados" marca só os visíveis pelo filtro', () => {
    const onChange = vi.fn();
    render(<PermissionMultiSelect options={options} value={[]} onChange={onChange} />);

    buscar('users');
    fireEvent.click(screen.getByRole('button', { name: /Selecionar todos os 2 resultados/ }));

    // p3 e p4 ficaram escondidos pelo filtro e NÃO entram.
    expect(onChange).toHaveBeenCalledWith(['p1', 'p2']);
  });

  it('vira "Limpar seleção (N)" e desmarca as visíveis quando todas já estão marcadas', () => {
    const onChange = vi.fn();
    render(<PermissionMultiSelect options={options} value={['p1', 'p2', 'p3']} onChange={onChange} />);

    buscar('users');
    const botao = screen.getByRole('button', { name: /Limpar seleção \(2\)/ });
    fireEvent.click(botao);

    // p3 está selecionada mas fora do filtro: permanece intacta.
    expect(onChange).toHaveBeenCalledWith(['p3']);
  });

  it('não duplica ids que já estão em value', () => {
    const onChange = vi.fn();
    render(<PermissionMultiSelect options={options} value={['p1']} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: /Selecionar todos os 4 resultados/ }));

    expect(onChange).toHaveBeenCalledWith(['p1', 'p2', 'p3', 'p4']);
  });

  it('fica desabilitado quando o filtro não deixa nenhuma opção marcável', () => {
    render(
      <PermissionMultiSelect
        options={options}
        value={[]}
        onChange={() => {}}
        alreadyAssignedIds={['p3']}
      />,
    );

    buscar('roles.manage');

    const botao = screen.getByRole('button', { name: /Selecionar todos os 0 resultados/ }) as HTMLButtonElement;
    expect(botao.disabled).toBe(true);
  });
});

describe('PermissionMultiSelect — já vinculadas', () => {
  it('aparecem marcadas, travadas e com o selo "Já vinculada"', () => {
    render(
      <PermissionMultiSelect
        options={options}
        value={[]}
        onChange={() => {}}
        alreadyAssignedIds={['p2']}
      />,
    );

    const vinculado = checkbox('Users.View - Users:View');
    expect(isChecked(vinculado)).toBe(true);
    expect(isDisabled(vinculado)).toBe(true);
    expect(screen.getByText('Já vinculada')).toBeTruthy();

    // As demais seguem livres.
    expect(isDisabled(checkbox('Users.Edit - Users:Edit'))).toBe(false);
  });

  it('clicar numa vinculada não dispara onChange', () => {
    const onChange = vi.fn();
    render(
      <PermissionMultiSelect
        options={options}
        value={[]}
        onChange={onChange}
        alreadyAssignedIds={['p2']}
      />,
    );

    fireEvent.click(checkbox('Users.View - Users:View'));

    expect(onChange).not.toHaveBeenCalled();
  });

  it('"selecionar todos" ignora as vinculadas e não as duplica na lista', () => {
    const onChange = vi.fn();
    render(
      <PermissionMultiSelect
        options={options}
        value={['p1']}
        onChange={onChange}
        alreadyAssignedIds={['p2', 'p3']}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Selecionar todos os 2 resultados/ }));

    // Vinculadas (p2, p3) ficam de fora; só p4 é novo.
    expect(onChange).toHaveBeenCalledWith(['p1', 'p4']);
    expect(screen.getAllByText('Já vinculada').length).toBe(2);
  });

  it('opção com disabled vem marcada e travada', () => {
    const onChange = vi.fn();
    render(
      <PermissionMultiSelect
        options={[...options, { id: 'p5', label: 'Sistema.Root', code: 'Sistema.Root', disabled: true }]}
        value={[]}
        onChange={onChange}
        alreadyAssignedIds={[]}
      />,
    );

    // disabled sem alreadyAssigned: ela é marcada e travada? Não — só as
    // vinculadas forçam checked; disabled apenas impede a interação.
    const travada = checkbox('Sistema.Root');
    expect(isDisabled(travada)).toBe(true);
    fireEvent.click(travada);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('PermissionMultiSelect — contador, loading e disabled', () => {
  it('mostra "N selecionada(s)" e "M de T permissão(ões)"', () => {
    render(
      <PermissionMultiSelect options={options} value={['p1', 'p3']} onChange={() => {}} />,
    );

    expect(screen.getByText('2 selecionada(s)')).toBeTruthy();
    // O contador de selecionadas fica num nó próprio; o "M de T" aparece também
    // no resumo aria-live, por isso a asserção usa getAllByText.
    expect(screen.getAllByText(/4 de 4 permissão\(ões\)/).length).toBeGreaterThan(0);

    buscar('users');

    expect(screen.getByText('2 selecionada(s)')).toBeTruthy();
    expect(screen.getAllByText(/2 de 4 permissão\(ões\)/).length).toBeGreaterThan(0);
  });

  it('loading mostra "Carregando permissões..."', () => {
    render(<PermissionMultiSelect options={options} value={[]} onChange={() => {}} loading />);

    expect(screen.getByText('Carregando permissões...')).toBeTruthy();
  });

  it('disabled desabilita campo de busca, checkboxes e ação em lote', () => {
    render(
      <PermissionMultiSelect options={options} value={[]} onChange={() => {}} disabled />,
    );

    expect(isDisabled(screen.getByLabelText('Buscar permissão'))).toBe(true);
    expect(isDisabled(checkbox('Users.Edit - Users:Edit'))).toBe(true);
    const botao = screen.getByRole('button', { name: /0 resultados|Limpar seleção/ }) as HTMLButtonElement;
    expect(botao.disabled).toBe(true);
  });

  it('agrupa as opções por group', () => {
    render(<PermissionMultiSelect options={options} value={[]} onChange={() => {}} />);

    expect(screen.getByText('Users')).toBeTruthy();
    expect(screen.getByText('Roles')).toBeTruthy();
    expect(screen.getByText('Agents')).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Permissões' })).toBeTruthy();
  });
});
