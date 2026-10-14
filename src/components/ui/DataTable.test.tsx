import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DataTable, type Column } from './DataTable';

interface Row {
  id: string;
  label: string;
  weight: number;
  actionType: string;
}

const rows: Row[] = [
  { id: 'a', label: 'Dez', weight: 10, actionType: 'RunScript' },
  { id: 'b', label: 'Dois', weight: 2, actionType: 'InstallPackage' },
];

const columns: Column<Row>[] = [
  { key: 'label', header: 'Label', render: (r) => r.label, sortValue: (r) => r.label },
  { key: 'weight', header: 'Peso', render: (r) => String(r.weight), sortValue: (r) => r.weight },
  // Key que NÃO existe no item (como a coluna "action" que lê actionType): sem
  // sortValue, a comparação virava '' === '' e a coluna não ordenava.
  { key: 'action', header: 'Ação', render: (r) => r.actionType, sortValue: (r) => r.actionType },
];

const bodyOrder = () =>
  screen.getAllByRole('row').filter((row) => row.querySelector('td')).map((row) => row.textContent ?? '');

function renderTable(props: Partial<React.ComponentProps<typeof DataTable<Row>>> = {}) {
  return render(
    <DataTable
      columns={columns}
      data={rows}
      keyExtractor={(r) => r.id}
      showPagination={false}
      {...props}
    />,
  );
}

describe('DataTable — ordenação', () => {
  afterEach(() => cleanup());

  it('defaultSort já abre a tabela ordenada (asc e desc)', () => {
    renderTable({ defaultSort: { key: 'weight', direction: 'asc' } });
    expect(bodyOrder()).toEqual(['Dois2InstallPackage', 'Dez10RunScript']);
    cleanup();

    // sortValue numérico: 2 antes de 10, e o desc inverte.
    renderTable({ defaultSort: { key: 'weight', direction: 'desc' } });
    expect(bodyOrder()).toEqual(['Dez10RunScript', 'Dois2InstallPackage']);
  });

  it('ordena coluna cujo key não existe no item (usa sortValue)', () => {
    renderTable({ defaultSort: { key: 'action', direction: 'asc' } });
    expect(bodyOrder()[0]).toContain('InstallPackage');
  });

  it('usa sortKey quando a coluna tem nome diferente da propriedade', () => {
    const cols: Column<Row>[] = [
      { key: 'pesoKg', header: 'Peso kg', sortKey: 'weight', render: (r) => String(r.weight) },
    ];
    render(
      <DataTable
        columns={cols}
        data={rows}
        keyExtractor={(r) => r.id}
        showPagination={false}
        defaultSort={{ key: 'pesoKg', direction: 'asc' }}
      />,
    );
    expect(bodyOrder()).toEqual(['2', '10']);
  });

  it('não oferece ordenação em coluna sem accessor (evita clique morto)', () => {
    const cols: Column<Row>[] = [
      { key: 'label', header: 'Label', render: (r) => r.label, sortValue: (r) => r.label },
      { key: 'weight', header: 'Peso', render: (r) => String(r.weight), sortValue: (r) => r.weight },
      { key: 'missing', header: 'Inexistente', render: () => '—' },
    ];
    render(<DataTable columns={cols} data={rows} keyExtractor={(r) => r.id} showPagination={false} />);

    const th = screen.getByText('Inexistente').closest('th') as HTMLTableCellElement;
    expect(th.className).not.toContain('cursor-pointer');
    expect(th.getAttribute('aria-sort')).toBeNull();

    fireEvent.click(th);
    expect(bodyOrder()).toEqual(['Dez10—', 'Dois2—']);
  });

  it('clicar no cabeçalho alterna asc → desc → sem ordenação', () => {
    renderTable();
    expect(bodyOrder()).toEqual(['Dez10RunScript', 'Dois2InstallPackage']);

    fireEvent.click(screen.getByText('Peso'));
    expect(bodyOrder()).toEqual(['Dois2InstallPackage', 'Dez10RunScript']);

    fireEvent.click(screen.getByText('Peso'));
    expect(bodyOrder()).toEqual(['Dez10RunScript', 'Dois2InstallPackage']);
  });
});
