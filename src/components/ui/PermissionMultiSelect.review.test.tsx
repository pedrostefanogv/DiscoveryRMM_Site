import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PermissionMultiSelect, type PermissionOption } from './PermissionMultiSelect';

/**
 * REVISÃO ADVERSARIAL — PermissionMultiSelect.
 *
 * Este arquivo NÃO repete os testes de src/components/ui/PermissionMultiSelect.test.tsx
 * (caminho feliz). Ele ataca os modos de falha: escala real do catálogo (~150 itens),
 * assimetria entre value e alreadyAssignedIds, busca por code que não aparece na tela,
 * limite de altura e nomes acessíveis.
 */

afterEach(cleanup);

/** O projeto não usa jest-dom: checamos os atributos nativos do input. */
function isChecked(element: HTMLElement): boolean {
  return (element as HTMLInputElement).checked;
}

function isDisabled(element: HTMLElement): boolean {
  return (element as HTMLInputElement).disabled;
}

function buscar(termo: string) {
  fireEvent.change(screen.getByLabelText('Buscar permissão'), { target: { value: termo } });
}

/**
 * Catálogo sintético de 150 permissões em 10 grupos, no formato REAL da API:
 * `code - name`, com o código `Grupo.Ação`. 150 > 104 do catálogo de produção.
 */
function catalogoGrande(total = 150): PermissionOption[] {
  return Array.from({ length: total }, (_, indice) => {
    const grupo = `Grupo${String(indice % 10).padStart(2, '0')}`;
    const acao = `Acao${String(indice).padStart(3, '0')}`;
    const codigo = `${grupo}.${acao}`;
    return { id: `id-${indice}`, label: `${codigo} - ${acao} descrita`, code: codigo, group: grupo };
  });
}

const OPCOES: PermissionOption[] = [
  { id: 'p1', label: 'Users.Edit - Users:Edit', code: 'Users.Edit', group: 'Users' },
  { id: 'p2', label: 'Users.View - Users:View', code: 'Users.View', group: 'Users' },
  { id: 'p3', label: 'Roles.Manage - Roles:Manage', code: 'Roles.Manage', group: 'Roles' },
  { id: 'p4', label: 'Agents.Connect - Agents:Connect', code: 'Agents.Connect', group: 'Agents' },
];

describe('REVIEW PermissionMultiSelect — hipótese 1: escala (~150 itens)', () => {
  it('renderiza as 150 opções, filtra corretamente e não duplica ids ao selecionar tudo', () => {
    const onChange = vi.fn();
    const opcoes = catalogoGrande(150);
    render(<PermissionMultiSelect options={opcoes} value={[]} onChange={onChange} />);

    // Todas as 150 estão na lista e o contador bate com o total.
    expect(screen.getAllByRole('checkbox').length).toBe(150);
    // "M de T" aparece no contador E no resumo aria-live: asserção por getAll.
    expect(screen.getAllByText(/150 de 150 permissão\(ões\)/).length).toBe(2);

    // O botão de lote anuncia exatamente as 150 marcáveis.
    expect(screen.getByRole('button', { name: /Selecionar todos os 150 resultados/ })).toBeTruthy();

    // Filtrar reduz a lista ao subconjunto esperado (15 itens por grupo em 150/10).
    buscar('grupo03.');
    const visiveis = screen.getAllByRole('checkbox');
    expect(visiveis.length).toBe(15);
    expect(screen.getAllByText(/15 de 150 permissão\(ões\)/).length).toBeGreaterThan(0);
  });

  it('"selecionar todos" em 150 itens devolve 150 ids ÚNICOS e na ordem do catálogo', () => {
    const onChange = vi.fn();
    const opcoes = catalogoGrande(150);
    render(<PermissionMultiSelect options={opcoes} value={[]} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: /Selecionar todos os 150 resultados/ }));

    expect(onChange).toHaveBeenCalledTimes(1);
    const enviado = onChange.mock.calls[0][0] as string[];
    expect(enviado.length).toBe(150);
    expect(new Set(enviado).size).toBe(150); // sem duplicatas
    expect(enviado).toEqual(opcoes.map((opcao) => opcao.id)); // ordem estável
  });

  it('com metade já vinculada, o lote marca só as 75 atribuíveis (sem duplicar e sem reenviar vinculadas)', () => {
    const onChange = vi.fn();
    const opcoes = catalogoGrande(150);
    const vinculadas = opcoes.slice(0, 75).map((opcao) => opcao.id);
    render(
      <PermissionMultiSelect
        options={opcoes}
        value={[]}
        onChange={onChange}
        alreadyAssignedIds={vinculadas}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Selecionar todos os 75 resultados/ }));

    const enviado = onChange.mock.calls[0][0] as string[];
    expect(enviado.length).toBe(75);
    expect(new Set(enviado).size).toBe(75);
    // NENHUMA vinculada pode reaparecer como nova.
    expect(enviado.some((id) => vinculadas.includes(id))).toBe(false);
    expect(enviado).toEqual(opcoes.slice(75).map((opcao) => opcao.id));
  });

  it('"selecionar todos" repetido não infla a lista (idempotência de UI)', () => {
    const onChange = vi.fn();
    const opcoes = catalogoGrande(150);
    // value JÁ com as 150: o botão deve ter virado "Limpar seleção".
    render(
      <PermissionMultiSelect options={opcoes} value={opcoes.map((o) => o.id)} onChange={onChange} />,
    );

    const botao = screen.getByRole('button', { name: /Limpar seleção \(150\)/ });
    fireEvent.click(botao);

    expect(onChange).toHaveBeenCalledWith([]);
  });
});

describe('REVIEW PermissionMultiSelect — hipótese 2: filtro + já vinculadas', () => {
  it('só os visíveis pelo filtro entram no lote (escondidos ficam de fora)', () => {
    const onChange = vi.fn();
    render(<PermissionMultiSelect options={OPCOES} value={[]} onChange={onChange} />);

    buscar('agents');
    fireEvent.click(screen.getByRole('button', { name: /Selecionar todos os 1 resultados/ }));

    expect(onChange).toHaveBeenCalledWith(['p4']);
  });

  it('vincular nunca é reenviado como novo, mesmo estando marcado na tela', () => {
    const onChange = vi.fn();
    render(
      <PermissionMultiSelect
        options={OPCOES}
        value={[]}
        onChange={onChange}
        alreadyAssignedIds={['p1', 'p2']}
      />,
    );

    // p1/p2 aparecem MARCADAS...
    expect(isChecked(screen.getByLabelText('Users.Edit - Users:Edit'))).toBe(true);
    expect(isChecked(screen.getByLabelText('Users.View - Users:View'))).toBe(true);

    // ...mas não estão em `value`: o contador de novas continua 0.
    expect(screen.getByText('0 selecionada(s)')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Selecionar todos os 2 resultados/ }));

    // O lote leva apenas p3/p4 — nunca p1/p2.
    const enviado = onChange.mock.calls[0][0] as string[];
    expect(enviado).toEqual(['p3', 'p4']);
    expect(enviado).not.toContain('p1');
    expect(enviado).not.toContain('p2');
  });

  it('checkbox vinculado é travado: clique e teclado não disparam onChange', () => {
    const onChange = vi.fn();
    render(
      <PermissionMultiSelect options={OPCOES} value={[]} onChange={onChange} alreadyAssignedIds={['p1']} />,
    );

    const vinculado = screen.getByLabelText('Users.Edit - Users:Edit') as HTMLInputElement;
    expect(isDisabled(vinculado)).toBe(true);
    fireEvent.click(vinculado);
    fireEvent.change(vinculado, { target: { checked: false } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('ordem do value é preservada ao remover do meio (não reordena silenciosamente)', () => {
    const onChange = vi.fn();
    render(
      <PermissionMultiSelect options={OPCOES} value={['p4', 'p2', 'p1']} onChange={onChange} />,
    );

    fireEvent.click(screen.getByLabelText('Users.View - Users:View'));

    expect(onChange).toHaveBeenCalledWith(['p4', 'p1']);
  });

  it('filtro sem resultado zera o lote e desabilita o botão (não age às cegas)', () => {
    render(<PermissionMultiSelect options={OPCOES} value={[]} onChange={() => {}} />);

    buscar('zzz-inexistente');

    const botao = screen.getByRole('button', {
      name: /Selecionar todos os 0 resultados/,
    }) as HTMLButtonElement;
    expect(botao.disabled).toBe(true);
    expect(screen.getAllByText('Nenhuma permissão corresponde ao filtro.').length).toBeGreaterThan(0);
  });
});

describe('REVIEW PermissionMultiSelect — hipótese 8: acessibilidade e contrato visual', () => {
  it('todo checkbox tem nome acessível e a lista é um group rotulado', () => {
    render(<PermissionMultiSelect options={OPCOES} value={[]} onChange={() => {}} />);

    const grupo = screen.getByRole('group', { name: 'Permissões' });
    const checkboxes = within(grupo).getAllByRole('checkbox');
    expect(checkboxes.length).toBe(4);
    for (const checkbox of checkboxes) {
      expect(checkbox.getAttribute('aria-label')).toBeTruthy();
    }

    // Nomes exatos batem com o rótulo exibido (o consumidor depende disso).
    expect(screen.getByLabelText('Roles.Manage - Roles:Manage')).toBeTruthy();
  });

  it('o resumo do filtro é anunciado em aria-live="polite"', () => {
    render(<PermissionMultiSelect options={OPCOES} value={[]} onChange={() => {}} />);

    const regioes = document.querySelectorAll('[aria-live="polite"]');
    expect(regioes.length).toBeGreaterThan(0);
    expect(Array.from(regioes).some((r) => /4 de 4 permissão/.test(r.textContent ?? ''))).toBe(true);
  });

  it('busca por code encontra item cujo TEXTO VISÍVEL não contém o termo (só o code)', () => {
    const onChange = vi.fn();
    const opcoes: PermissionOption[] = [
      { id: 'x1', label: 'Editar usuários', code: 'Users.Edit', group: 'Users' },
      { id: 'x2', label: 'Editar papéis', code: 'Roles.Edit', group: 'Roles' },
    ];
    render(<PermissionMultiSelect options={opcoes} value={[]} onChange={onChange} />);

    buscar('users.edit');

    // Filtrou certo...
    expect(screen.getByLabelText('Editar usuários')).toBeTruthy();
    expect(screen.queryByLabelText('Editar papéis')).toBeNull();

    // ...e o lote respeita o filtro embora "users.edit" não apareça como texto.
    fireEvent.click(screen.getByRole('button', { name: /Selecionar todos os 1 resultados/ }));
    expect(onChange).toHaveBeenCalledWith(['x1']);
  });

  it('respeita maxHeightClassName para conter listas longas', () => {
    const { container } = render(
      <PermissionMultiSelect
        options={OPCOES}
        value={[]}
        onChange={() => {}}
        maxHeightClassName="max-h-40"
      />,
    );

    expect(container.querySelector('.max-h-40')).toBeTruthy();
    expect(container.querySelector('.max-h-72')).toBeNull();
  });

  it('loading tem precedência sobre a lista e não mostra checkboxes clicáveis', () => {
    render(<PermissionMultiSelect options={OPCOES} value={[]} onChange={() => {}} loading />);

    expect(screen.getByText('Carregando permissões...')).toBeTruthy();
    expect(screen.queryAllByRole('checkbox').length).toBe(0);
  });
});

describe('REVIEW PermissionMultiSelect — hipótese 3 (lado do componente): value controlado', () => {
  it('não guarda seleção interna: o mesmo clique com value vazio sempre devolve 1 id', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <PermissionMultiSelect options={OPCOES} value={[]} onChange={onChange} />,
    );

    fireEvent.click(screen.getByLabelText('Users.Edit - Users:Edit'));
    expect(onChange).toHaveBeenNthCalledWith(1, ['p1']);

    // O chamador IGNORA o onChange (value continua []): um novo clique deve
    // produzir exatamente o mesmo resultado — prova de que não há estado espelho.
    rerender(<PermissionMultiSelect options={OPCOES} value={[]} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('Users.Edit - Users:Edit'));
    expect(onChange).toHaveBeenNthCalledWith(2, ['p1']);

    // E o checkbox segue visualmente DESMARCADO (fonte da verdade é a prop).
    expect(isChecked(screen.getByLabelText('Users.Edit - Users:Edit'))).toBe(false);
  });

  it('opção com disabled=true aparece travada porém NÃO marcada (só vinculada força checked)', () => {
    const onChange = vi.fn();
    render(
      <PermissionMultiSelect
        options={[...OPCOES, { id: 'pd', label: 'Sistema.Root', code: 'Sistema.Root', disabled: true }]}
        value={[]}
        onChange={onChange}
      />,
    );

    const travada = screen.getByLabelText('Sistema.Root') as HTMLInputElement;
    expect(isDisabled(travada)).toBe(true);
    expect(isChecked(travada)).toBe(false);
    fireEvent.click(travada);
    expect(onChange).not.toHaveBeenCalled();
  });
});
