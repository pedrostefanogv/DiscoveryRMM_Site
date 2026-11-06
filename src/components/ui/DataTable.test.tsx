import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

/**
 * Card de hover (`rowHoverCard`): o modo "clamp" é OPT-IN.
 *
 * Os outros 4 consumidores (TicketList, AgentPoliciesPanel, AgentScheduledTasks-
 * Panel e AgentStartupItemsPanel) NÃO passam `hoverCardClamp` — estes testes
 * travam o comportamento legado para que o fix da aba Sensores não mude nada lá.
 */
describe('DataTable — card de hover (rowHoverCard)', () => {
  let offsetHeightDescriptor: PropertyDescriptor | undefined;

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    // jsdom não implementa offsetHeight: quando o teste injeta um valor, restaura.
    if (offsetHeightDescriptor) {
      Object.defineProperty(HTMLElement.prototype, 'offsetHeight', offsetHeightDescriptor);
      offsetHeightDescriptor = undefined;
    }
  });

  function hoverCard(row: Row) {
    return <div>Detalhes de {row.label}</div>;
  }

  function renderWithHover(
    props: Partial<React.ComponentProps<typeof DataTable<Row>>> = {},
  ) {
    return render(
      <DataTable
        columns={columns}
        data={rows}
        keyExtractor={(r) => r.id}
        showPagination={false}
        rowHoverCard={hoverCard}
        rowHoverDelayMs={0}
        {...props}
      />,
    );
  }

  const firstBodyRow = () =>
    screen.getAllByRole('row').find((row) => row.querySelector('td')) as HTMLElement;

  /** Rect controlado: jsdom devolve zeros, então o posicionamento é simulado. */
  function rect(top: number, bottom: number, width = 800): DOMRect {
    return {
      x: 0,
      y: top,
      top,
      bottom,
      left: 0,
      right: width,
      width,
      height: bottom - top,
      toJSON: () => ({}),
    } as DOMRect;
  }

  /**
   * Container (div "relative space-y-3") e linhas (`tr`) recebem rects
   * previsíveis; o resto continua zerado.
   */
  function mockRects(options: { containerBottom: number; rowTop: number; rowBottom: number }) {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: HTMLElement) {
        if (this.tagName === 'TR') return rect(options.rowTop, options.rowBottom);
        if (
          typeof this.className === 'string' &&
          this.className.includes('relative space-y-3')
        ) {
          return rect(0, options.containerBottom);
        }
        return rect(0, 0);
      },
    );
  }

  async function hoverFirstRow(options: { delayMs?: number; clamp?: boolean } = {}) {
    const delayMs = options.delayMs ?? 0;
    vi.useFakeTimers();
    renderWithHover({
      rowHoverDelayMs: delayMs,
      hoverCardClamp: options.clamp,
    });
    fireEvent.mouseOver(firstBodyRow());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(delayMs);
      // Deixa o layout effect + rAF de reposicionamento rodarem.
      await vi.advanceTimersByTimeAsync(32);
    });
    return screen.getByRole('dialog');
  }

  it('renderiza o card apenas depois do delay configurado', async () => {
    vi.useFakeTimers();
    renderWithHover({ rowHoverDelayMs: 500 });
    fireEvent.mouseOver(firstBodyRow());
    expect(screen.queryByRole('dialog')).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(499);
    });
    expect(screen.queryByRole('dialog')).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.getByRole('dialog').textContent).toContain('Detalhes de Dez');
  });

  it('modo legado (sem hoverCardClamp) preserva o card e a posição anterior', async () => {
    mockRects({ containerBottom: 600, rowTop: 100, rowBottom: 130 });
    const dialog = await hoverFirstRow();

    // Debounce/render do card continuam iguais ao comportamento anterior.
    expect(dialog.textContent).toContain('Detalhes de Dez');

    // Sem max-height e sem rolagem: o card é apenas visual.
    expect(dialog.className).toContain('pointer-events-none');
    expect(dialog.className).not.toContain('overflow-y-auto');
    expect(dialog.className).not.toContain('pointer-events-auto');
    expect(dialog.style.maxHeight).toBe('');

    // Matemática legada (estimativa fixa de 220px): abre abaixo da linha.
    expect(dialog.style.top).toBe('140px');
    expect(dialog.style.left).toBe('8px');
    expect(dialog.style.width).toBe('460px');
  });

  it('modo clamp usa position: fixed e não é preso ao contêiner da tabela', async () => {
    mockRects({ containerBottom: 600, rowTop: 100, rowBottom: 130 });
    const dialog = await hoverFirstRow({ clamp: true });

    // O modo opt-in liga a rolagem interna e aceita ponteiro (ler tudo).
    expect(dialog.className).toContain('overflow-y-auto');
    expect(dialog.className).toContain('pointer-events-auto');
    expect(dialog.className).not.toContain('pointer-events-none');
    // `fixed` escapa do `overflow-hidden` da moldura e do `overflow-auto` da
    // área de rolagem — era isso que recortava o card no fim da tabela.
    expect(dialog.className).toContain('fixed');
    expect(dialog.className).not.toContain('absolute');
  });

  it('modo clamp limita a altura pela VIEWPORT, não pela borda inferior da tabela', async () => {
    // A tabela termina MUITO antes do fim da viewport: 460px contra 900px.
    // Antes do fix o max-height era min(420, containerBottom-rowBottom-22) =
    // 420 - nada; mas o card era `absolute` dentro do contêiner e ficava
    // recortado na borda. Agora o limite é a viewport (900 - 24 = 876 → teto
    // de 460), independentemente da altura da tabela.
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(900);
    mockRects({ containerBottom: 460, rowTop: 100, rowBottom: 130 });
    const dialog = await hoverFirstRow({ clamp: true });

    expect(dialog.style.maxHeight).toBe('460px');
    // Coordenadas de viewport: logo abaixo da linha (130 + 10).
    expect(dialog.style.top).toBe('140px');
  });

  it('modo clamp abre acima quando não há espaço útil abaixo', async () => {
    // Linha no rodapé da viewport: só 8px abaixo dela.
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(600);
    mockRects({ containerBottom: 600, rowTop: 540, rowBottom: 570 });

    // O card "mede" 300px (jsdom não calcula offsetHeight).
    offsetHeightDescriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'offsetHeight',
    );
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get: () => 300,
    });

    const dialog = await hoverFirstRow({ clamp: true });

    // Acima da linha: 540 (topo) - 300 (altura MEDIDA) - 10 (offset) = 230.
    expect(dialog.style.top).toBe('230px');
    // 230 < topo da linha (540): o card não desce sobre o rodapé cortado.
    expect(Number.parseInt(dialog.style.top, 10)).toBeLessThan(540);
    // Max-height nunca acima do teto do modo clamp.
    expect(dialog.style.maxHeight).toBe('460px');
  });

  it('modo clamp prefere abrir abaixo quando há espaço útil (card alto)', async () => {
    // Linha a 40px do topo; abaixo sobram ~460px — não cabe o card inteiro
    // (600px), mas há espaço útil, então abre abaixo e rola por dentro.
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(600);
    mockRects({ containerBottom: 600, rowTop: 20, rowBottom: 40 });

    offsetHeightDescriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'offsetHeight',
    );
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get: () => 600,
    });

    const dialog = await hoverFirstRow({ clamp: true });

    // Abaixo da linha (40 + 10), em vez de subir para cima.
    expect(dialog.style.top).toBe('50px');
  });
});

