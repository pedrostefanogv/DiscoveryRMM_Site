import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { Pagination } from './Pagination';

describe('Pagination', () => {
  it('mostra o intervalo quando total e pageSize são conhecidos', () => {
    render(
      <Pagination page={2} totalPages={5} onPageChange={() => {}} totalItems={95} pageSize={20} />,
    );
    expect(screen.getByText('Mostrando 21–40 de 95')).toBeTruthy();
    expect(screen.getByText('2 / 5')).toBeTruthy();
  });

  it('usa "Página N de M" quando não há intervalo', () => {
    render(<Pagination page={2} totalPages={4} onPageChange={vi.fn()} />);
    expect(screen.getByText('Página 2 de 4')).toBeTruthy();
  });

  it('não mostra intervalo inconsistente quando a lista está vazia', () => {
    render(
      <Pagination page={1} totalPages={1} onPageChange={() => {}} totalItems={0} pageSize={20} />,
    );
    expect(screen.getByText('Nenhum item')).toBeTruthy();
  });

  it('navega pelos botões respeitando os limites', () => {
    const onPageChange = vi.fn();
    render(<Pagination page={1} totalPages={3} onPageChange={onPageChange} />);

    expect(screen.getByRole('button', { name: 'Primeira página' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Página anterior' })).toHaveProperty('disabled', true);

    fireEvent.click(screen.getByRole('button', { name: 'Próxima página' }));
    expect(onPageChange).toHaveBeenCalledWith(2);

    fireEvent.click(screen.getByRole('button', { name: 'Última página' }));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it('no modo cursor usa apenas anterior/próxima e respeita hasNext', () => {
    const onNext = vi.fn();
    const { rerender } = render(
      <Pagination
        page={1}
        totalPages={1}
        onPageChange={() => {}}
        cursor={{ hasPrev: false, hasNext: false, onPrev: vi.fn(), onNext }}
      />,
    );

    expect(screen.getByText('Página 1')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Primeira página' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Próxima página' })).toHaveProperty('disabled', true);

    rerender(
      <Pagination
        page={1}
        totalPages={1}
        onPageChange={() => {}}
        itemLabel="12 no total"
        cursor={{ hasPrev: false, hasNext: true, onPrev: vi.fn(), onNext }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Próxima página' }));
    expect(onNext).toHaveBeenCalled();
    expect(screen.getByText('Página 1 · 12 no total')).toBeTruthy();
  });
});
