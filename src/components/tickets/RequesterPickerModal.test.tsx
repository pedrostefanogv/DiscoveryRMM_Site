import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RequesterPickerModal } from './RequesterPickerModal';

const users = [
  { id: 'u1', fullName: 'Ana Souza', login: 'ana', email: 'ana@empresa.com', isActive: true },
  { id: 'u2', fullName: 'Bruno Lima', login: 'bruno', email: 'bruno@empresa.com', isActive: true },
] as never[];

describe('RequesterPickerModal', () => {
  afterEach(() => cleanup());

  it('não renderiza fechado', () => {
    const { container } = render(
      <RequesterPickerModal open={false} users={users} selectedId={null} onClose={() => {}} onSave={() => {}} />,
    );
    expect(container.textContent).toBe('');
  });

  it('busca, seleciona e salva o solicitante', () => {
    const onSave = vi.fn();
    render(<RequesterPickerModal open users={users} selectedId={null} onClose={() => {}} onSave={onSave} />);

    fireEvent.change(screen.getByLabelText('Buscar usuário'), { target: { value: 'bruno' } });
    expect(screen.queryByText('Ana Souza')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Bruno Lima/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(onSave).toHaveBeenCalledWith('u2');
  });

  it('permite remover o solicitante', () => {
    const onSave = vi.fn();
    render(<RequesterPickerModal open users={users} selectedId="u1" onClose={() => {}} onSave={onSave} />);

    fireEvent.click(screen.getByRole('button', { name: /Remover solicitante/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(onSave).toHaveBeenCalledWith(null);
  });
});
