import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DepartmentPickerModal } from './DepartmentPickerModal';

const departments = [
  { id: 'd1', name: 'Suporte N1', clientId: null, isActive: true, sortOrder: 1 },
  { id: 'd2', name: 'Infraestrutura', clientId: 'c1', isActive: true, sortOrder: 2 },
] as never[];

describe('DepartmentPickerModal', () => {
  afterEach(() => cleanup());

  it('não renderiza fechado', () => {
    const { container } = render(
      <DepartmentPickerModal open={false} departments={departments} selectedId={null} onClose={() => {}} onSave={() => {}} />,
    );
    expect(container.textContent).toBe('');
  });

  it('busca por nome, seleciona e transfere', () => {
    const onSave = vi.fn();
    render(<DepartmentPickerModal open departments={departments} selectedId={null} onClose={() => {}} onSave={onSave} />);

    expect(screen.getByText('Suporte N1')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Buscar departamento'), { target: { value: 'infra' } });
    expect(screen.queryByText('Suporte N1')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Infraestrutura/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Transferir' }));

    expect(onSave).toHaveBeenCalledWith('d2');
  });

  it('não transfere quando o departamento atual é selecionado', () => {
    const onSave = vi.fn();
    render(<DepartmentPickerModal open departments={departments} selectedId="d1" onClose={() => {}} onSave={onSave} />);

    fireEvent.click(screen.getByRole('button', { name: 'Transferir' }));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('remove o vínculo quando "Sem departamento" é escolhido', () => {
    const onSave = vi.fn();
    render(<DepartmentPickerModal open departments={departments} selectedId="d1" onClose={() => {}} onSave={onSave} />);

    fireEvent.click(screen.getByRole('button', { name: /Sem departamento/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Remover departamento' }));
    expect(onSave).toHaveBeenCalledWith(null);
  });

  it('avisa quando não há departamento no escopo', () => {
    render(<DepartmentPickerModal open departments={[]} selectedId={null} onClose={() => {}} onSave={() => {}} />);

    expect(screen.getByText('Nenhum departamento neste escopo.')).toBeTruthy();
  });
});
